import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { supabase, type Member, type GameRecord } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, ChevronUp, ChevronDown } from "lucide-react";

type SortField = "name" | "avgScore" | "improvement";
type SortDir = "asc" | "desc";

type MemberStat = {
  member: Member;
  avgScore: number;
  firstScore: number;
  firstDate: string;
  improvement: number;
  gameCount: number;
};

function formatDate(d: string) {
  return d.replace(/-/g, ".");
}

export default function ScoreComparison() {
  const [, setLocation] = useLocation();

  const [members, setMembers] = useState<Member[]>([]);
  const [allRecords, setAllRecords] = useState<GameRecord[]>([]);
  const [gameDates, setGameDates] = useState<string[]>([]);
  const [loadingDates, setLoadingDates] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingFrom, setPendingFrom] = useState<string>("");
  const [pendingTo, setPendingTo] = useState<string>("");
  const [appliedFrom, setAppliedFrom] = useState<string>("");
  const [appliedTo, setAppliedTo] = useState<string>("");
  const [filteredRecords, setFilteredRecords] = useState<GameRecord[]>([]);

  const [sortField, setSortField] = useState<SortField>("avgScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Fetch members + all unique game dates on mount
  useEffect(() => {
    async function init() {
      setLoadingDates(true);
      setError(null);
      try {
        const [{ data: membersData, error: mErr }, { data: recordsData, error: rErr }] =
          await Promise.all([
            supabase.from("members").select("*").eq("is_deleted", false).order("name"),
            supabase.from("game_records").select("*").order("date", { ascending: true }),
          ]);
        if (mErr) throw mErr;
        if (rErr) throw rErr;

        setMembers(membersData || []);
        setAllRecords(recordsData || []);

        const dates = Array.from(
          new Set((recordsData || []).map((r) => r.date))
        ).sort();

        setGameDates(dates);

        if (dates.length >= 1) {
          const from = dates[0];
          const to = dates[dates.length - 1];
          setPendingFrom(from);
          setPendingTo(to);
          setAppliedFrom(from);
          setAppliedTo(to);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "데이터 불러오기 실패");
      } finally {
        setLoadingDates(false);
      }
    }
    init();
  }, []);

  // Filter records whenever applied range changes
  useEffect(() => {
    if (!appliedFrom || !appliedTo) return;
    setLoadingRecords(true);
    const filtered = allRecords.filter(
      (r) => r.date >= appliedFrom && r.date <= appliedTo
    );
    setFilteredRecords(filtered);
    setLoadingRecords(false);
  }, [appliedFrom, appliedTo, allRecords]);

  function applyFilter() {
    setAppliedFrom(pendingFrom);
    setAppliedTo(pendingTo);
  }

  const isDirty = pendingFrom !== appliedFrom || pendingTo !== appliedTo;

  // Stats computation
  const stats = useMemo((): MemberStat[] => {
    const perMember = new Map<
      string,
      {
        totalAvg: number;
        gameCount: number;
        firstDate: string;
        firstAvg: number;
      }
    >();

    // records are sorted ascending by date
    const sorted = [...filteredRecords].sort((a, b) => a.date.localeCompare(b.date));

    for (const record of sorted) {
      const validScores = (record.scores || []).filter(
        (s): s is number => s !== null && s !== undefined && !isNaN(Number(s))
      );
      if (validScores.length === 0) continue;
      const avg = validScores.reduce((a, b) => a + b, 0) / validScores.length;

      const existing = perMember.get(record.member_id);
      if (existing) {
        existing.totalAvg += avg;
        existing.gameCount += 1;
      } else {
        // First participation for this member in the range
        perMember.set(record.member_id, {
          totalAvg: avg,
          gameCount: 1,
          firstDate: record.date,
          firstAvg: avg,
        });
      }
    }

    return members
      .filter((m) => perMember.has(m.id))
      .map((member) => {
        const s = perMember.get(member.id)!;
        const avgScore = Math.round(s.totalAvg / s.gameCount);
        const firstScore = Math.round(s.firstAvg);
        const improvement = avgScore - firstScore;
        return {
          member,
          avgScore,
          firstScore,
          firstDate: s.firstDate,
          improvement,
          gameCount: s.gameCount,
        };
      });
  }, [members, filteredRecords]);

  const sortedStats = useMemo(() => {
    return [...stats].sort((a, b) => {
      let aVal: string | number = 0;
      let bVal: string | number = 0;
      if (sortField === "name") { aVal = a.member.name; bVal = b.member.name; }
      else { aVal = a[sortField]; bVal = b[sortField]; }
      if (typeof aVal === "string")
        return sortDir === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [stats, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="opacity-25 ml-1 text-xs">↕</span>;
    return sortDir === "desc"
      ? <ChevronDown className="inline w-3 h-3 ml-0.5" />
      : <ChevronUp className="inline w-3 h-3 ml-0.5" />;
  }

  const loading = loadingDates || loadingRecords;

  // Dates valid for "to" selector: >= pendingFrom
  const toDateOptions = gameDates.filter((d) => d >= pendingFrom);
  // Dates valid for "from" selector: <= pendingTo
  const fromDateOptions = gameDates.filter((d) => d <= pendingTo);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Top nav */}
        <div className="flex items-center gap-3">
          <button
            data-testid="btn-back"
            onClick={() => setLocation("/")}
            className="w-8 h-8 rounded-lg bg-secondary hover:bg-muted flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-bold">점수 비교</h1>
        </div>

        {/* Game Date Filter */}
        <Card className="border-card-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              게임 일자 선택
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingDates ? (
              <div className="flex gap-3">
                <Skeleton className="h-9 w-40 rounded-md" />
                <Skeleton className="h-9 w-40 rounded-md" />
              </div>
            ) : gameDates.length === 0 ? (
              <p className="text-sm text-muted-foreground">게임 데이터가 없습니다</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground font-medium whitespace-nowrap">
                    시작 게임일
                  </label>
                  <select
                    data-testid="select-from-date"
                    value={pendingFrom}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPendingFrom(val);
                      if (val > pendingTo) setPendingTo(val);
                    }}
                    className="border border-input rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                  >
                    {fromDateOptions.map((d) => (
                      <option key={d} value={d}>{formatDate(d)}</option>
                    ))}
                  </select>
                </div>

                <span className="text-muted-foreground">~</span>

                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground font-medium whitespace-nowrap">
                    종료 게임일
                  </label>
                  <select
                    data-testid="select-to-date"
                    value={pendingTo}
                    onChange={(e) => setPendingTo(e.target.value)}
                    className="border border-input rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                  >
                    {toDateOptions.map((d) => (
                      <option key={d} value={d}>{formatDate(d)}</option>
                    ))}
                  </select>
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

                {isDirty && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 w-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                    변경된 기간을 적용하려면 확인 버튼을 누르세요
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card className="border-card-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              회원별 평균 점수
              {!loading && (
                <Badge variant="secondary" className="text-xs">{sortedStats.length}명</Badge>
              )}
              {appliedFrom && appliedTo && (
                <span className="ml-auto text-xs font-normal text-muted-foreground/70">
                  {formatDate(appliedFrom)} ~ {formatDate(appliedTo)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
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
                        <span className="block text-xs font-normal opacity-60">첫 참여 게임 평균</span>
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
                          <td className="px-4 py-3 text-right">
                            <span className="text-muted-foreground font-mono">{s.firstScore}</span>
                            <span className="block text-xs text-muted-foreground/50 mt-0.5">
                              {formatDate(s.firstDate)}
                            </span>
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
                              {isUp ? (
                                <TrendingUp className="w-3.5 h-3.5" />
                              ) : isDown ? (
                                <TrendingDown className="w-3.5 h-3.5" />
                              ) : (
                                <Minus className="w-3.5 h-3.5" />
                              )}
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
      </div>
    </div>
  );
}
