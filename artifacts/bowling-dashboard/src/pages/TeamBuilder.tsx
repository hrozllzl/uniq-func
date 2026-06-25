import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase, type Member, type GameRecord } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, X, GripVertical, Users, Settings, Shuffle } from "lucide-react";

type ScoringMethod = "recent" | "average";
type BalancingMethod = "avg" | "total";

type MemberWithScore = {
  member: Member;
  score: number;
};

type Team = {
  id: string;
  name: string;
  members: MemberWithScore[];
};

function calcTeamAvg(team: Team) {
  if (team.members.length === 0) return 0;
  return Math.round(team.members.reduce((s, m) => s + m.score, 0) / team.members.length);
}
function calcTeamTotal(team: Team) {
  return Math.round(team.members.reduce((s, m) => s + m.score, 0));
}

// Snake-draft to equalize averages
function buildTeamsAvg(members: MemberWithScore[], numTeams: number): Team[] {
  const teams: Team[] = Array.from({ length: numTeams }, (_, i) => ({
    id: `team-${i + 1}`,
    name: `팀 ${i + 1}`,
    members: [],
  }));
  const sorted = [...members].sort((a, b) => b.score - a.score);
  sorted.forEach((m, idx) => {
    const round = Math.floor(idx / numTeams);
    const pos = idx % numTeams;
    const teamIdx = round % 2 === 0 ? pos : numTeams - 1 - pos;
    teams[teamIdx].members.push(m);
  });
  return teams;
}

// Greedy: always assign to team with lowest total
function buildTeamsTotal(members: MemberWithScore[], numTeams: number): Team[] {
  const teams: Team[] = Array.from({ length: numTeams }, (_, i) => ({
    id: `team-${i + 1}`,
    name: `팀 ${i + 1}`,
    members: [],
  }));
  const sorted = [...members].sort((a, b) => b.score - a.score);
  sorted.forEach((m) => {
    const minTeam = teams.reduce((min, t) => calcTeamTotal(t) < calcTeamTotal(min) ? t : min, teams[0]);
    minTeam.members.push(m);
  });
  return teams;
}

// ── Draggable member card ──────────────────────────────────────────────────
function SortableMemberCard({
  mws,
  teamId,
  overlay = false,
}: {
  mws: MemberWithScore;
  teamId: string;
  overlay?: boolean;
}) {
  const id = `${teamId}::${mws.member.id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`member-card-${mws.member.id}`}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-card-border text-sm select-none
        ${isDragging && !overlay ? "opacity-40" : ""}
        ${overlay ? "shadow-lg ring-2 ring-primary/40" : "hover:bg-muted/30"}
      `}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
      >
        <GripVertical className="w-4 h-4" />
      </span>
      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
        {mws.member.name[0]}
      </div>
      <span className="flex-1 font-medium">{mws.member.name}</span>
      <span className="text-xs text-muted-foreground font-mono">{Math.round(mws.score)}점</span>
    </div>
  );
}

// ── Droppable team column ──────────────────────────────────────────────────
function TeamColumn({ team, isOver }: { team: Team; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id: team.id });
  const itemIds = team.members.map((m) => `${team.id}::${m.member.id}`);

  return (
    <div
      ref={setNodeRef}
      data-testid={`team-col-${team.id}`}
      className={`flex flex-col gap-2 rounded-xl border-2 p-3 min-h-[120px] transition-colors
        ${isOver ? "border-primary/50 bg-primary/5" : "border-card-border bg-card"}
      `}
    >
      {/* Team header */}
      <div className="flex items-center justify-between pb-1 border-b border-card-border mb-1">
        <span className="font-bold text-sm">{team.name}</span>
        <div className="flex gap-2 text-xs">
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
            평균 {calcTeamAvg(team)}점
          </span>
          <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
            총 {calcTeamTotal(team)}점
          </span>
        </div>
      </div>

      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {team.members.map((mws) => (
          <SortableMemberCard key={mws.member.id} mws={mws} teamId={team.id} />
        ))}
      </SortableContext>

      {team.members.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/50 italic py-4">
          여기에 드롭하세요
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function TeamBuilder() {
  const [, setLocation] = useLocation();

  const [members, setMembers] = useState<Member[]>([]);
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [numTeams, setNumTeams] = useState(2);
  const [scoring, setScoring] = useState<ScoringMethod>("average");
  const [balancing, setBalancing] = useState<BalancingMethod>("avg");
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [hasBuilt, setHasBuilt] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [{ data: membersData, error: mErr }, { data: recordsData, error: rErr }] =
          await Promise.all([
            supabase.from("members").select("*").eq("is_deleted", false).order("name"),
            supabase
              .from("game_records")
              .select("*")
              .order("date", { ascending: false }),
          ]);
        if (mErr) throw mErr;
        if (rErr) throw rErr;
        setMembers(membersData || []);
        setRecords(recordsData || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "데이터 불러오기 실패");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Compute score per member based on scoring method
  const memberScores = useMemo((): MemberWithScore[] => {
    return members
      .filter((m) => !excludedIds.has(m.id))
      .map((member) => {
        const memberRecords = records.filter((r) => r.member_id === member.id);
        if (memberRecords.length === 0) return { member, score: 0 };

        if (scoring === "recent") {
          // most recent game avg
          const latest = memberRecords[0]; // already sorted desc
          const valid = (latest.scores || []).filter((s): s is number => s !== null && !isNaN(Number(s)));
          const score = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
          return { member, score: Math.round(score) };
        } else {
          // overall average
          let total = 0, count = 0;
          for (const rec of memberRecords) {
            const valid = (rec.scores || []).filter((s): s is number => s !== null && !isNaN(Number(s)));
            total += valid.reduce((a, b) => a + b, 0);
            count += valid.length;
          }
          return { member, score: count ? Math.round(total / count) : 0 };
        }
      })
      .sort((a, b) => a.member.name.localeCompare(b.member.name));
  }, [members, records, excludedIds, scoring]);

  function buildTeams() {
    if (memberScores.length === 0) return;
    const n = Math.min(numTeams, memberScores.length);
    const built = balancing === "avg"
      ? buildTeamsAvg(memberScores, n)
      : buildTeamsTotal(memberScores, n);
    setTeams(built);
    setHasBuilt(true);
  }

  // DnD helpers
  function findTeamByDragId(id: string): Team | undefined {
    return teams.find((t) => t.members.some((m) => `${t.id}::${m.member.id}` === id));
  }
  function findTeamById(id: string): Team | undefined {
    return teams.find((t) => t.id === id);
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over ? String(event.over.id) : null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      setOverId(null);
      const { active, over } = event;
      if (!over) return;

      const activeIdStr = String(active.id);
      const overIdStr = String(over.id);
      if (activeIdStr === overIdStr) return;

      // Resolve source team & member
      const sourceTeam = findTeamByDragId(activeIdStr);
      if (!sourceTeam) return;
      const memberId = activeIdStr.split("::")[1];
      const movingMember = sourceTeam.members.find((m) => m.member.id === memberId);
      if (!movingMember) return;

      // Resolve target team — could be a team column drop or another member card
      let targetTeam = findTeamById(overIdStr);
      if (!targetTeam) {
        // overIdStr might be a member card id
        targetTeam = findTeamByDragId(overIdStr);
      }
      if (!targetTeam || targetTeam.id === sourceTeam.id) {
        // Reorder within same team
        if (!targetTeam) return;
        const targetMemberId = overIdStr.split("::")[1];
        setTeams((prev) =>
          prev.map((t) => {
            if (t.id !== sourceTeam.id) return t;
            const newMembers = [...t.members];
            const fromIdx = newMembers.findIndex((m) => m.member.id === memberId);
            const toIdx = newMembers.findIndex((m) => m.member.id === targetMemberId);
            if (fromIdx === -1 || toIdx === -1) return t;
            const [item] = newMembers.splice(fromIdx, 1);
            newMembers.splice(toIdx, 0, item);
            return { ...t, members: newMembers };
          })
        );
        return;
      }

      // Move across teams
      setTeams((prev) => {
        const newTeams = prev.map((t) => {
          if (t.id === sourceTeam!.id) {
            return { ...t, members: t.members.filter((m) => m.member.id !== memberId) };
          }
          if (t.id === targetTeam!.id) {
            const targetMemberId = overIdStr.includes("::") ? overIdStr.split("::")[1] : null;
            const newMembers = [...t.members];
            if (targetMemberId) {
              const toIdx = newMembers.findIndex((m) => m.member.id === targetMemberId);
              newMembers.splice(toIdx >= 0 ? toIdx : newMembers.length, 0, movingMember!);
            } else {
              newMembers.push(movingMember!);
            }
            return { ...t, members: newMembers };
          }
          return t;
        });
        return newTeams;
      });
    },
    [teams]
  );

  const activeMember = useMemo(() => {
    if (!activeId) return null;
    const team = findTeamByDragId(activeId);
    if (!team) return null;
    const memberId = activeId.split("::")[1];
    return { mws: team.members.find((m) => m.member.id === memberId)!, teamId: team.id };
  }, [activeId, teams]);

  const overTeamId = useMemo(() => {
    if (!overId) return null;
    const directTeam = findTeamById(overId);
    if (directTeam) return directTeam.id;
    const memberTeam = findTeamByDragId(overId);
    return memberTeam?.id || null;
  }, [overId, teams]);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            data-testid="btn-back"
            onClick={() => setLocation("/")}
            className="w-8 h-8 rounded-lg bg-secondary hover:bg-muted flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-bold">팀 짜기</h1>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-3">
              {[0,1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-10 text-destructive text-sm">{error}</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── LEFT: Members + Settings ───────────────────────────── */}
            <div className="space-y-4">
              {/* Member list */}
              <Card className="border-card-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    참여 회원
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {memberScores.length}명
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {members.map((member) => {
                    const excluded = excludedIds.has(member.id);
                    return (
                      <div
                        key={member.id}
                        data-testid={`member-list-${member.id}`}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                          excluded
                            ? "border-dashed border-muted opacity-40 bg-muted/20"
                            : "border-card-border bg-background hover:bg-muted/20"
                        }`}
                      >
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {member.name[0]}
                        </div>
                        <span className="flex-1 font-medium">{member.name}</span>
                        <button
                          data-testid={`btn-exclude-${member.id}`}
                          onClick={() =>
                            setExcludedIds((prev) => {
                              const next = new Set(prev);
                              excluded ? next.delete(member.id) : next.add(member.id);
                              return next;
                            })
                          }
                          className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors text-xs font-bold ${
                            excluded
                              ? "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                              : "bg-rose-100 text-rose-500 hover:bg-rose-200"
                          }`}
                          title={excluded ? "복귀" : "제외"}
                        >
                          {excluded ? "+" : <X className="w-3 h-3" />}
                        </button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Settings */}
              <Card className="border-card-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    팀 설정
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Team count */}
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-2">팀 개수</label>
                    <div className="flex items-center gap-2">
                      <button
                        data-testid="btn-team-minus"
                        onClick={() => setNumTeams((n) => Math.max(2, n - 1))}
                        className="w-8 h-8 rounded-lg bg-secondary hover:bg-muted text-secondary-foreground font-bold transition-colors"
                      >
                        −
                      </button>
                      <span
                        data-testid="text-num-teams"
                        className="w-10 text-center font-bold text-lg"
                      >
                        {numTeams}
                      </span>
                      <button
                        data-testid="btn-team-plus"
                        onClick={() => setNumTeams((n) => Math.min(Math.max(2, memberScores.length), n + 1))}
                        className="w-8 h-8 rounded-lg bg-secondary hover:bg-muted text-secondary-foreground font-bold transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Scoring method */}
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-2">능력치 기준</label>
                    <div className="flex gap-2">
                      {(["average", "recent"] as ScoringMethod[]).map((m) => (
                        <button
                          key={m}
                          data-testid={`btn-scoring-${m}`}
                          onClick={() => setScoring(m)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            scoring === m
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-secondary text-secondary-foreground hover:bg-muted"
                          }`}
                        >
                          {m === "average" ? "평균 점수" : "최근 점수"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Balancing method */}
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-2">팀 짜기 방식</label>
                    <div className="flex gap-2">
                      {(["avg", "total"] as BalancingMethod[]).map((m) => (
                        <button
                          key={m}
                          data-testid={`btn-balancing-${m}`}
                          onClick={() => setBalancing(m)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            balancing === m
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-secondary text-secondary-foreground hover:bg-muted"
                          }`}
                        >
                          {m === "avg" ? "평균 일치" : "총점 일치"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    data-testid="btn-build-teams"
                    onClick={buildTeams}
                    disabled={memberScores.length < numTeams}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-400 to-sky-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Shuffle className="w-4 h-4" />
                    팀 짜기
                  </button>
                </CardContent>
              </Card>
            </div>

            {/* ── RIGHT: Team columns ─────────────────────────────────── */}
            <div className="lg:col-span-2">
              {!hasBuilt ? (
                <div className="h-full flex items-center justify-center min-h-[300px] rounded-2xl border-2 border-dashed border-card-border bg-card">
                  <div className="text-center text-muted-foreground">
                    <Shuffle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">설정 후 팀 짜기 버튼을 누르세요</p>
                    <p className="text-xs mt-1 opacity-60">팀 배정 결과가 여기에 표시됩니다</p>
                  </div>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                >
                  <div
                    className={`grid gap-4 ${
                      teams.length <= 2
                        ? "grid-cols-1 sm:grid-cols-2"
                        : teams.length <= 4
                        ? "grid-cols-2"
                        : "grid-cols-2 xl:grid-cols-3"
                    }`}
                  >
                    {teams.map((team) => (
                      <TeamColumn
                        key={team.id}
                        team={team}
                        isOver={overTeamId === team.id}
                      />
                    ))}
                  </div>

                  <DragOverlay>
                    {activeMember && (
                      <SortableMemberCard
                        mws={activeMember.mws}
                        teamId={activeMember.teamId}
                        overlay
                      />
                    )}
                  </DragOverlay>
                </DndContext>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
