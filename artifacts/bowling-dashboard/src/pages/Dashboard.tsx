import { useState, useEffect, useMemo } from "react";
import { supabase, type Member, type GameRecord, type MemberStats } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Trophy,
  Target,
  Calendar,
  TrendingUp,
  Users,
  Activity,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

const QUICK_RANGES = [
  { label: "최근 1개월", days: 30 },
  { label: "최근 3개월", days: 90 },
  { label: "최근 6개월", days: 180 },
  { label: "올해", days: 0, isYear: true },
  { label: "전체", days: -1 },
];

const CHART_COLORS = [
  "hsl(215, 85%, 52%)",
  "hsl(160, 60%, 45%)",
  "hsl(35, 90%, 55%)",
  "hsl(280, 65%, 58%)",
  "hsl(0, 72%, 55%)",
  "hsl(195, 80%, 48%)",
  "hsl(330, 70%, 52%)",
  "hsl(60, 75%, 45%)",
];

function getDateRange(days: number, isYear?: boolean): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().split("T")[0];
  if (days === -1) return { from: "2000-01-01", to };
  if (isYear) {
    const from = `${today.getFullYear()}-01-01`;
    return { from, to };
  }
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  return { from: from.toISOString().split("T")[0], to };
}

type SortField = "name" | "avgScore" | "gameCount" | "maxScore";
type SortDir = "asc" | "desc";

export default function Dashboard() {
  const [members, setMembers] = useState<Member[]>([]);
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const threeMonthsAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split("T")[0];
  })();

  const [fromDate, setFromDate] = useState(threeMonthsAgo);
  const [toDate, setToDate] = useState(today);
  const [activeRange, setActiveRange] = useState(1);
  const [sortField, setSortField] = useState<SortField>("avgScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [{ data: membersData, error: membersErr }, { data: recordsData, error: recordsErr }] =
          await Promise.all([
            supabase.from("members").select("*").eq("is_deleted", false).order("name"),
            supabase
              .from("game_records")
              .select("*")
              .gte("date", fromDate)
              .lte("date", toDate)
              .order("date", { ascending: false }),
          ]);

        if (membersErr) throw membersErr;
        if (recordsErr) throw recordsErr;

        setMembers(membersData || []);
        setRecords(recordsData || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "데이터를 불러오는 중 오류가 발생했습니다");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [fromDate, toDate]);

  const memberStats = useMemo((): MemberStats[] => {
    const memberMap = new Map<string, Member>(members.map((m) => [m.id, m]));

    const statsMap = new Map<
      string,
      { total: number; count: number; max: number; min: number; games: number }
    >();

    for (const record of records) {
      const validScores = (record.scores || []).filter(
        (s): s is number => s !== null && s !== undefined && !isNaN(s)
      );
      if (validScores.length === 0) continue;

      const existing = statsMap.get(record.member_id);
      const sum = validScores.reduce((a, b) => a + b, 0);
      const max = Math.max(...validScores);
      const min = Math.min(...validScores);

      if (existing) {
        existing.total += sum;
        existing.count += validScores.length;
        existing.max = Math.max(existing.max, max);
        existing.min = Math.min(existing.min, min);
        existing.games += 1;
      } else {
        statsMap.set(record.member_id, {
          total: sum,
          count: validScores.length,
          max,
          min,
          games: 1,
        });
      }
    }

    return members
      .filter((m) => statsMap.has(m.id))
      .map((member) => {
        const s = statsMap.get(member.id)!;
        return {
          member,
          avgScore: Math.round(s.total / s.count),
          gameCount: s.games,
          totalScores: s.count,
          maxScore: s.max,
          minScore: s.min,
        };
      });
  }, [members, records]);

  const sortedStats = useMemo(() => {
    return [...memberStats].sort((a, b) => {
      let aVal: string | number = 0;
      let bVal: string | number = 0;
      if (sortField === "name") {
        aVal = a.member.name;
        bVal = b.member.name;
      } else {
        aVal = a[sortField];
        bVal = b[sortField];
      }
      if (typeof aVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      }
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [memberStats, sortField, sortDir]);

  const selectedMemberStats = useMemo(() => {
    if (!selectedMemberId) return null;
    return memberStats.find((s) => s.member.id === selectedMemberId) || null;
  }, [memberStats, selectedMemberId]);

  const overallAvg = memberStats.length
    ? Math.round(memberStats.reduce((sum, s) => sum + s.avgScore, 0) / memberStats.length)
    : 0;
  const topPlayer = sortedStats[0] || null;
  const totalGames = records.length;

  function handleQuickRange(idx: number, range: (typeof QUICK_RANGES)[0]) {
    setActiveRange(idx);
    const { from, to } = getDateRange(range.days, range.isYear);
    setFromDate(from);
    setToDate(to);
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="opacity-30 ml-1">↕</span>;
    return sortDir === "desc" ? (
      <ChevronDown className="inline w-3 h-3 ml-1" />
    ) : (
      <ChevronUp className="inline w-3 h-3 ml-1" />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-sidebar text-sidebar-foreground shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">볼링 점수 대시보드</h1>
            <p className="text-xs text-sidebar-foreground/60 mt-0.5">회원별 평균 점수 분석</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
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
                    activeRange === idx
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-secondary text-secondary-foreground hover:bg-muted"
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground font-medium">시작일</label>
                <input
                  type="date"
                  data-testid="input-from-date"
                  value={fromDate}
                  max={toDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setActiveRange(-1);
                  }}
                  className="border border-input rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <span className="text-muted-foreground">~</span>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground font-medium">종료일</label>
                <input
                  type="date"
                  data-testid="input-to-date"
                  value={toDate}
                  min={fromDate}
                  max={today}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setActiveRange(-1);
                  }}
                  className="border border-input rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="border-card-border">
                <CardContent className="pt-5">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-10 text-destructive">{error}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-card-border shadow-sm bg-gradient-to-br from-primary/5 to-primary/10">
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">전체 평균 점수</span>
                    <TrendingUp className="w-4 h-4 text-primary" />
                  </div>
                  <p data-testid="stat-overall-avg" className="text-3xl font-bold text-primary">
                    {overallAvg}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-card-border shadow-sm">
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">참여 회원</span>
                    <Users className="w-4 h-4 text-chart-2" />
                  </div>
                  <p data-testid="stat-member-count" className="text-3xl font-bold">
                    {memberStats.length}
                    <span className="text-sm font-normal text-muted-foreground ml-1">명</span>
                  </p>
                </CardContent>
              </Card>

              <Card className="border-card-border shadow-sm">
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">총 게임 수</span>
                    <Activity className="w-4 h-4 text-chart-3" />
                  </div>
                  <p data-testid="stat-total-games" className="text-3xl font-bold">
                    {totalGames}
                    <span className="text-sm font-normal text-muted-foreground ml-1">게임</span>
                  </p>
                </CardContent>
              </Card>

              <Card className="border-card-border shadow-sm bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20">
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">최고 평균</span>
                    <Trophy className="w-4 h-4 text-yellow-500" />
                  </div>
                  {topPlayer ? (
                    <>
                      <p data-testid="stat-top-player-name" className="text-lg font-bold leading-tight">
                        {topPlayer.member.name}
                      </p>
                      <p data-testid="stat-top-player-score" className="text-2xl font-bold text-yellow-600">
                        {topPlayer.avgScore}점
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-sm">데이터 없음</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Chart */}
            {sortedStats.length > 0 && (
              <Card className="border-card-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <BarChart className="w-4 h-4" />
                    회원별 평균 점수 비교
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={sortedStats.map((s, i) => ({
                        name: s.member.name,
                        avg: s.avgScore,
                        color: CHART_COLORS[i % CHART_COLORS.length],
                      }))}
                      margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12, fontFamily: "Noto Sans KR, sans-serif" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        domain={[0, 300]}
                        tickCount={7}
                      />
                      <Tooltip
                        formatter={(value: number) => [`${value}점`, "평균 점수"]}
                        labelStyle={{ fontFamily: "Noto Sans KR, sans-serif", fontWeight: 600 }}
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid hsl(220, 15%, 88%)",
                          fontSize: "13px",
                        }}
                      />
                      <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                        {sortedStats.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Table */}
            <Card className="border-card-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  회원별 상세 통계
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {sortedStats.length}명
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {sortedStats.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
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
                          <th
                            className="text-right px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                            onClick={() => handleSort("avgScore")}
                          >
                            평균 점수 <SortIcon field="avgScore" />
                          </th>
                          <th
                            className="text-right px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                            onClick={() => handleSort("gameCount")}
                          >
                            게임 수 <SortIcon field="gameCount" />
                          </th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                            최고점
                          </th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                            최저점
                          </th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                            점수 분포
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedStats.map((stats, idx) => {
                          const isSelected = selectedMemberId === stats.member.id;
                          const barWidth = Math.round((stats.avgScore / 300) * 100);
                          const rank = idx + 1;
                          const rankColor =
                            rank === 1
                              ? "text-yellow-500"
                              : rank === 2
                              ? "text-gray-400"
                              : rank === 3
                              ? "text-amber-600"
                              : "text-muted-foreground";

                          return (
                            <tr
                              key={stats.member.id}
                              data-testid={`row-member-${stats.member.id}`}
                              className={`border-b last:border-0 transition-colors cursor-pointer ${
                                isSelected
                                  ? "bg-accent/50"
                                  : "hover:bg-muted/30"
                              }`}
                              onClick={() =>
                                setSelectedMemberId(isSelected ? null : stats.member.id)
                              }
                            >
                              <td className={`px-4 py-3 font-bold text-sm ${rankColor}`}>
                                {rank <= 3 ? ["1st", "2nd", "3rd"][rank - 1] : rank}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
                                    {stats.member.name[0]}
                                  </div>
                                  <span className="font-medium">{stats.member.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span
                                  data-testid={`avg-score-${stats.member.id}`}
                                  className="text-base font-bold text-primary"
                                >
                                  {stats.avgScore}
                                </span>
                                <span className="text-xs text-muted-foreground ml-0.5">점</span>
                              </td>
                              <td className="px-4 py-3 text-right text-muted-foreground">
                                {stats.gameCount}
                                <span className="text-xs ml-0.5">게임</span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="text-green-600 font-medium">{stats.maxScore}</span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="text-rose-500 font-medium">{stats.minScore}</span>
                              </td>
                              <td className="px-4 py-3 hidden md:table-cell">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-muted rounded-full h-1.5">
                                    <div
                                      className="h-1.5 rounded-full bg-primary transition-all"
                                      style={{ width: `${barWidth}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground w-8 text-right">
                                    {barWidth}%
                                  </span>
                                </div>
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

            {/* Selected member detail */}
            {selectedMemberStats && (
              <Card className="border-primary/30 shadow-md bg-accent/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                      {selectedMemberStats.member.name[0]}
                    </div>
                    {selectedMemberStats.member.name} 상세 정보
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: "평균 점수", value: `${selectedMemberStats.avgScore}점`, highlight: true },
                      { label: "게임 수", value: `${selectedMemberStats.gameCount}게임` },
                      { label: "최고 점수", value: `${selectedMemberStats.maxScore}점`, green: true },
                      { label: "최저 점수", value: `${selectedMemberStats.minScore}점`, red: true },
                    ].map(({ label, value, highlight, green, red }) => (
                      <div key={label} className="text-center p-3 bg-background rounded-lg border border-card-border">
                        <p className="text-xs text-muted-foreground mb-1">{label}</p>
                        <p
                          className={`text-xl font-bold ${
                            highlight ? "text-primary" : green ? "text-green-600" : red ? "text-rose-500" : ""
                          }`}
                        >
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

      <footer className="mt-12 border-t py-4 text-center text-xs text-muted-foreground">
        볼링 점수 대시보드 &mdash; Supabase 연동
      </footer>
    </div>
  );
}
