import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { supabase, type Member, type GameRecord } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Calendar, TrendingUp, TrendingDown, Minus, ChevronUp, ChevronDown } from "lucide-react";

const QUICK_RANGES = [
  { label: "최근 1개월", days: 30 },
  { label: "최근 3개월", days: 90 },
  { label: "최근 6개월", days: 180 },
  { label: "올해", isYear: true },
  { label: "전체", days: -1 },
];

function getDateRange(days: number, isYear?: boolean): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().split("T")[0];
  if (days === -1) return { from: "2000-01-01", to };
  if (isYear) {
    return { from: `${today.getFullYear()}-01-01`, to };
  }
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  return { from: from.toISOString().split("T")[0], to };
}

type SortField = "name" | "avgScore" | "improvement";
type SortDir = "asc" | "desc";

type MemberStat = {
  member: Member;
  avgScore: number;
  firstScore: number;
  improvement: number;
  gameCount: number;
};

export default function ScoreComparison() {
  const [, setLocation] = useLocation();

  const today = new Date().toISOString().split("T")[0];
  const threeMonthsAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split("T")[0];
  })();

  const [pendingFrom, setPendingFrom] = useState(threeMonthsAgo);
  const [pendingTo, setPendingTo] = useState(today);
  const [appliedFrom, setAppliedFrom] = useState(threeMonthsAgo);
  const [appliedTo, setAppliedTo] = useState(today);
  const [activeRange, setActiveRange] = useState(1);
  const [pendingRange, setPendingRange] = useState(1);

  const [members, setMembers] = useState<Member[]>([]);
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortField, setSortField] = useState<SortField>("avgScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
              .gte("date", appliedFrom)
              .lte("date", appliedTo)
              .order("date", { ascending: true }),
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
  }, [appliedFrom, appliedTo]);

  function applyFilter() {
    setAppliedFrom(pendingFrom);
    setAppliedTo(pendingTo);
    setActiveRange(pendingRange);
  }

  function handleQuickRange(idx: number, range: (typeof QUICK_RANGES)[0]) {
    setPendingRange(idx);
    const { from, to } = getDateRange((range as { days?: number }).days ?? 0, range.isYear);
    setPendingFrom(from);
    setPendingTo(to);
  }

  const stats = useMemo((): MemberStat[] => {
    const memberMap = new Map<string, Member>(members.map((m) => [m.id, m]));

    const perMember = new Map<
      string,
      { total: number; count: number; firstAvg: number | null; firstDate: string | null; games: number }
    >();

    for (const record of records) {
      const validScores = (record.scores || []).filter(
        (s): s is number => s !== null && s !== undefined && !isNaN(Number(s))
      );
      if (validScores.length === 0) continue;
      const avg = validScores.reduce((a, b) => a + b, 0) / validScores.length;
      const existing = perMember.get(record.member_id);
      if (existing) {
        existing.total += avg;
        existing.count += 1;
        existing.games += 1;
        if (existing.firstDate === null || record.date < existing.firstDate) {
          existing.firstDate = record.date;
          existing.firstAvg = avg;
        }
      } else {
        perMember.set(record.member_id, {
          total: avg,
          count: 1,
          firstAvg: avg,
          firstDate: record.date,
          games: 1,
        });
      }
    }

    return members
      .filter((m) => perMember.has(m.id))
      .map((member) => {
        const s = perMember.get(member.id)!;
        const avgScore = Math.round(s.total / s.count);
        const firstScore = Math.round(s.firstAvg ?? avgScore);
        const improvement = avgScore - firstScore;
        return { member, avgScore, firstScore, improvement, gameCount: s.games };
      });
  }, [members, records]);

  const sortedStats = useMemo(() => {
    return [...stats].sort((a, b) => {
      let aVal: string | number = 0;
      let bVal: string | number = 0;
      if (sortField === "name") { aVal = a.member.name; bVal = b.member.name; }
      else { aVal = a[sortField]; bVal = b[sortField]; }
      if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [stats, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="opacity-25 ml-1 text-xs">↕</span>;
    return sortDir === "desc" ? <ChevronDown className="inline w-3 h-3 ml-0.5" /> : <ChevronUp className="inline w-3 h-3 ml-0.5" />;
  }

  const isDirty = pendingFrom !== appliedFrom || pendingTo !== appliedTo;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-sidebar text-sidebar-foreground shadow-lg">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <button
            data-testid="btn-back"
            onClick={() => setLocation("/")}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold tracking-tight">점수 비교</h1>
            <p className="text-xs text-sidebar-foreground/60">회원별 기간 평균 & 상승률</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Date Filter */}
        <Card className="border-card-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              기간 필터
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {QUICK_RANGES.map((range, idx) => (
                <button
                  key={range.label}
                  data-testid={`quick-range-${idx}`}
                  onClick={() => handleQuickRange(idx, range)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    pendingRange === idx
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-secondary text-secondary-foreground hover:bg-muted"
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground font-medium whitespace-nowrap">시작일</label>
                <input
                  type="date"
                  data-testid="input-from-date"
                  value={pendingFrom}
                  max={pendingTo}
                  onChange={(e) => { setPendingFrom(e.target.value); setPendingRange(-1); }}
                  className="border border-input rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <span className="text-muted-foreground pb-1.5">~</span>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground font-medium whitespace-nowrap">종료일</label>
                <input
                  type="date"
                  data-testid="input-to-date"
                  value={pendingTo}
                  min={pendingFrom}
                  max={today}
                  onChange={(e) => { setPendingTo(e.target.value); setPendingRange(-1); }}
                  className="border border-input rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                data-testid="btn-apply-filter"
                onClick={applyFilter}
                className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  isDirty
                    ? "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
                    : "bg-secondary text-secondary-foreground cursor-default"
                }`}
              >
                확인
              </button>
            </div>

            {isDirty && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                변경된 기간을 적용하려면 확인 버튼을 누르세요
              </p>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        <Card className="border-card-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              회원별 평균 점수
              {!loading && (
                <Badge variant="secondary" className="text-xs">{sortedStats.length}명</Badge>
              )}
              <span className="ml-auto text-xs font-normal text-muted-foreground/70">
                {appliedFrom} ~ {appliedTo}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {[0,1,2,3,4].map(i => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16 ml-auto" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-10 text-destructive text-sm">{error}</div>
            ) : sortedStats.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-sm">해당 기간에 기록된 데이터가 없습니다</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground w-8">#</th>
                      <th
                        className="text-left px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => handleSort("name")}
                      >
                        회원명 <SortIcon field="name" />
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                        기준 점수
                        <span className="block text-xs font-normal opacity-60">첫 게임 평균</span>
                      </th>
                      <th
                        className="text-right px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => handleSort("avgScore")}
                      >
                        평균 점수 <SortIcon field="avgScore" />
                      </th>
                      <th
                        className="text-right px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => handleSort("improvement")}
                      >
                        상승폭 <SortIcon field="improvement" />
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">게임 수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStats.map((s, idx) => {
                      const isUp = s.improvement > 0;
                      const isDown = s.improvement < 0;
                      return (
                        <tr
                          key={s.member.id}
                          data-testid={`row-member-${s.member.id}`}
                          className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-4 py-3 text-muted-foreground text-xs font-medium">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                {s.member.name[0]}
                              </div>
                              <span className="font-medium">{s.member.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground font-mono">
                            {s.firstScore}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-base font-bold text-primary">{s.avgScore}</span>
                            <span className="text-xs text-muted-foreground ml-0.5">점</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`inline-flex items-center gap-0.5 text-sm font-semibold px-2 py-0.5 rounded-md ${
                                isUp
                                  ? "bg-green-100 text-green-700"
                                  : isDown
                                  ? "bg-rose-100 text-rose-600"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : isDown ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                              {isUp ? "+" : ""}{s.improvement}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                            {s.gameCount}게임
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
