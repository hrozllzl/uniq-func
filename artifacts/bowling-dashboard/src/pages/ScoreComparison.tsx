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

function scoreColor(score: number) {
  return score >= 200 ? "text-red-500 font-bold" : "";
}

export default function ScoreComparison() {
  const [, setLocation] = useLocation();

  const [members, setMembers] = useState<Member[]>([]);
  const [allRecords, setAllRecords] = useState<GameRecord[]>([]);
  const [gameDates, setGameDates] = useState<string[]>([]);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // Year selectors
  const [fromYear, setFromYear] = useState<string>("");
  const [toYear, setToYear] = useState<string>("");

  const [sortField, setSortField] = useState<SortField>("improvement");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // All unique years from game dates
  const years = useMemo(
    () => Array.from(new Set(gameDates.map((d) => d.slice(0, 4)))).sort(),
    [gameDates]
  );

  // Dates filtered per year
  const fromDatesInYear = useMemo(
    () => gameDates.filter((d) => d.startsWith(fromYear)),
    [gameDates, fromYear]
  );
  const toDatesInYear = useMemo(
    () => gameDates.filter((d) => d.startsWith(toYear) && d >= fromDate),
    [gameDates, toYear, fromDate]
  );

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
          const firstDate = dates[0];
          const lastDate = dates[dates.length - 1];
          const firstYear = firstDate.slice(0, 4);
          const lastYear = lastDate.slice(0, 4);
          setFromYear(firstYear);
          setToYear(lastYear);
          setFromDate(firstDate);
          setToDate(lastDate);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "데이터 불러오기 실패");
      } finally {
        setLoadingDates(false);
      }
    }
    init();
  }, []);

  // When fromYear changes, reset fromDate to first date in that year
  function handleFromYearChange(year: string) {
    setFromYear(year);
    const datesInYear = gameDates.filter((d) => d.startsWith(year));
    if (datesInYear.length > 0) {
      const newFrom = datesInYear[0];
      setFromDate(newFrom);
      // If toDate is before newFrom, adjust toDate
      if (toDate < newFrom) {
        setToDate(newFrom);
        const newToYear = newFrom.slice(0, 4);
        setToYear(newToYear);
      }
    }
  }

  // When toYear changes, reset toDate to last date in that year (>= fromDate)
  function handleToYearChange(year: string) {
    setToYear(year);
    const datesInYear = gameDates.filter((d) => d.startsWith(year) && d >= fromDate);
    if (datesInYear.length > 0) {
      setToDate(datesInYear[datesInYear.length - 1]);
    }
  }

  // Filtered records — derived directly from fromDate/toDate (instant apply)
  const filteredRecords = useMemo(() => {
    if (!fromDate || !toDate) return [];
    return allRecords.filter((r) => r.date >= fromDate && r.date <= toDate);
  }, [allRecords, fromDate, toDate]);

  const stats = useMemo((): MemberStat[] => {
    const perMember = new Map<
      string,
      { totalAvg: number; gameCount: number; firstDate: string; firstAvg: number }
    >();

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
        return {
          member,
          avgScore,
          firstScore,
          firstDate: s.firstDate,
          improvement: avgScore - firstScore,
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

  const selectCls = "border border-input rounded-md px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer";

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
                <Skeleton className="h-9 w-24 rounded-md" />
                <Skeleton className="h-9 w-32 rounded-md" />
                <Skeleton className="h-9 w-24 rounded-md" />
                <Skeleton className="h-9 w-32 rounded-md" />
              </div>
            ) : gameDates.length === 0 ? (
              <p className="text-sm text-muted-foreground">게임 데이터가 없습니다</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {/* From */}
                <label className="text-sm text-muted-foreground font-medium whitespace-nowrap">시작</label>
                <select
                  data-testid="select-from-year"
                  value={fromYear}
                  onChange={(e) => handleFromYearChange(e.target.value)}
                  className={selectCls}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </select>
                <select
                  data-testid="select-from-date"
                  value={fromDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFromDate(val);
                    if (val > toDate) {
                      setToDate(val);
                      setToYear(val.slice(0, 4));
                    }
                  }}
                  className={selectCls}
                >
                  {fromDatesInYear.map((d) => (
                    <option key={d} value={d}>{formatDate(d)}</option>
                  ))}
                </select>

                <span className="text-muted-foreground px-1">~</span>

                {/* To */}
                <label className="text-sm text-muted-foreground font-medium whitespace-nowrap">종료</label>
                <select
                  data-testid="select-to-year"
                  value={toYear}
                  onChange={(e) => handleToYearChange(e.target.value)}
                  className={selectCls}
                >
                  {years.filter((y) => y >= fromYear).map((y) => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </select>
                <select
                  data-testid="select-to-date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className={selectCls}
                >
                  {toDatesInYear.map((d) => (
                    <option key={d} value={d}>{formatDate(d)}</option>
                  ))}
                </select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card className="border-card-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              회원별 평균 점수
              {!loadingDates && (
                <Badge variant="secondary" className="text-xs">{sortedStats.length}명</Badge>
              )}
              {fromDate && toDate && (
                <span className="ml-auto text-[13px] font-medium text-primary">
                  {formatDate(fromDate)} ~ {formatDate(toDate)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingDates ? (
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
                        <span className="block text-xs font-normal opacity-60">첫 참여 게임</span>
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
                            <span className={`font-medium ${scoreColor(s.firstScore)} ${!scoreColor(s.firstScore) ? "text-muted-foreground" : ""}`}>
                              {s.firstScore}
                            </span>
                            <span className="block text-xs text-muted-foreground/50 mt-0.5">
                              {formatDate(s.firstDate)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-base font-bold ${scoreColor(s.avgScore) || "text-primary"}`}>
                              {s.avgScore}
                            </span>
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
