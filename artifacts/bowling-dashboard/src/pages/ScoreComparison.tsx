import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { supabase, type Member, type GameRecord } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, ChevronUp, ChevronDown } from "lucide-react";

type SortField = "name" | "baseAvg" | "cmpAvg" | "delta";
type SortDir = "asc" | "desc";

type MemberStat = {
  member: Member;
  baseAvg: number | null;
  baseCount: number;
  cmpAvg: number | null;
  cmpCount: number;
  delta: number | null;
};

function formatDate(d: string) {
  return d.replace(/-/g, ".");
}

function formatDateShort(d: string) {
  return d.slice(5).replace("-", ".");
}

function avgColor(score: number | null) {
  if (score === null) return "";
  return score >= 200 ? "text-red-500 font-bold" : "";
}

function calcAvg(records: GameRecord[], memberId: string, from: string, to: string): { avg: number | null; count: number } {
  const filtered = records.filter(
    (r) => r.member_id === memberId && r.date >= from && r.date <= to
  );
  if (filtered.length === 0) return { avg: null, count: 0 };
  let total = 0, count = 0;
  for (const rec of filtered) {
    const valid = (rec.scores || []).filter((s): s is number => s !== null && !isNaN(Number(s)));
    total += valid.reduce((a, b) => a + b, 0);
    count += valid.length;
  }
  return { avg: count ? Math.round(total / count) : null, count: filtered.length };
}

export default function ScoreComparison() {
  const [, setLocation] = useLocation();

  const [members, setMembers] = useState<Member[]>([]);
  const [allRecords, setAllRecords] = useState<GameRecord[]>([]);
  const [gameDates, setGameDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Base period
  const [baseFromYear, setBaseFromYear] = useState("");
  const [baseFromDate, setBaseFromDate] = useState("");
  const [baseToYear, setBaseToYear] = useState("");
  const [baseToDate, setBaseToDate] = useState("");

  // Comparison period
  const [cmpFromYear, setCmpFromYear] = useState("");
  const [cmpFromDate, setCmpFromDate] = useState("");
  const [cmpToYear, setCmpToYear] = useState("");
  const [cmpToDate, setCmpToDate] = useState("");

  const [sortField, setSortField] = useState<SortField>("delta");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const years = useMemo(
    () => Array.from(new Set(gameDates.map((d) => d.slice(0, 4)))).sort(),
    [gameDates]
  );

  useEffect(() => {
    async function init() {
      setLoading(true);
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

        if (dates.length > 0) {
          const mid = Math.max(1, Math.floor(dates.length / 2));
          const baseFrom = dates[0];
          const baseTo = dates[mid - 1];
          const cmpFrom = dates[Math.min(mid, dates.length - 1)];
          const cmpTo = dates[dates.length - 1];

          setBaseFromDate(baseFrom);
          setBaseFromYear(baseFrom.slice(0, 4));
          setBaseToDate(baseTo);
          setBaseToYear(baseTo.slice(0, 4));

          setCmpFromDate(cmpFrom);
          setCmpFromYear(cmpFrom.slice(0, 4));
          setCmpToDate(cmpTo);
          setCmpToYear(cmpTo.slice(0, 4));
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "데이터 불러오기 실패");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Helper: dates in year filtered by a minimum date
  function datesInYear(year: string, minDate = "") {
    return gameDates.filter((d) => d.startsWith(year) && d >= minDate);
  }

  // Base period handlers
  function handleBaseFromYearChange(y: string) {
    setBaseFromYear(y);
    const ds = gameDates.filter((d) => d.startsWith(y));
    if (ds.length) {
      const newFrom = ds[0];
      setBaseFromDate(newFrom);
      if (baseToDate < newFrom) {
        setBaseToDate(newFrom);
        setBaseToYear(newFrom.slice(0, 4));
      }
    }
  }
  function handleBaseToYearChange(y: string) {
    setBaseToYear(y);
    const ds = gameDates.filter((d) => d.startsWith(y) && d >= baseFromDate);
    if (ds.length) setBaseToDate(ds[ds.length - 1]);
  }

  // Comparison period handlers
  function handleCmpFromYearChange(y: string) {
    setCmpFromYear(y);
    const ds = gameDates.filter((d) => d.startsWith(y));
    if (ds.length) {
      const newFrom = ds[0];
      setCmpFromDate(newFrom);
      if (cmpToDate < newFrom) {
        setCmpToDate(newFrom);
        setCmpToYear(newFrom.slice(0, 4));
      }
    }
  }
  function handleCmpToYearChange(y: string) {
    setCmpToYear(y);
    const ds = gameDates.filter((d) => d.startsWith(y) && d >= cmpFromDate);
    if (ds.length) setCmpToDate(ds[ds.length - 1]);
  }

  const stats = useMemo((): MemberStat[] => {
    if (!baseFromDate || !baseToDate || !cmpFromDate || !cmpToDate) return [];
    return members.map((member) => {
      const { avg: baseAvg, count: baseCount } = calcAvg(allRecords, member.id, baseFromDate, baseToDate);
      const { avg: cmpAvg, count: cmpCount } = calcAvg(allRecords, member.id, cmpFromDate, cmpToDate);
      const delta = baseAvg !== null && cmpAvg !== null ? cmpAvg - baseAvg : null;
      return { member, baseAvg, baseCount, cmpAvg, cmpCount, delta };
    }).filter((s) => s.baseCount > 0 || s.cmpCount > 0);
  }, [members, allRecords, baseFromDate, baseToDate, cmpFromDate, cmpToDate]);

  const sortedStats = useMemo(() => {
    return [...stats].sort((a, b) => {
      if (sortField === "name") {
        const cmp = a.member.name.localeCompare(b.member.name);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const aVal = a[sortField] ?? (sortDir === "asc" ? Infinity : -Infinity);
      const bVal = b[sortField] ?? (sortDir === "asc" ? Infinity : -Infinity);
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [stats, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="opacity-25 ml-0.5 text-xs">↕</span>;
    return sortDir === "desc"
      ? <ChevronDown className="inline w-3 h-3 ml-0.5" />
      : <ChevronUp className="inline w-3 h-3 ml-0.5" />;
  }

  const selectCls = "border border-input rounded-md px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer";

  function PeriodSelector({
    label,
    labelColor,
    fromYear, fromDate, toYear, toDate,
    onFromYearChange, onFromDateChange,
    onToYearChange, onToDateChange,
  }: {
    label: string;
    labelColor: string;
    fromYear: string; fromDate: string; toYear: string; toDate: string;
    onFromYearChange: (y: string) => void;
    onFromDateChange: (d: string) => void;
    onToYearChange: (y: string) => void;
    onToDateChange: (d: string) => void;
  }) {
    const fromDates = datesInYear(fromYear);
    const toDates = datesInYear(toYear, fromDate);
    return (
      <div className="flex flex-col gap-2">
        <span className={`text-xs font-semibold ${labelColor}`}>{label}</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">시작</span>
          <select value={fromYear} onChange={(e) => onFromYearChange(e.target.value)} className={selectCls}>
            {years.map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select
            value={fromDate}
            onChange={(e) => {
              const val = e.target.value;
              onFromDateChange(val);
              if (val > toDate) {
                onToDateChange(val);
                onToYearChange(val.slice(0, 4));
              }
            }}
            className={selectCls}
          >
            {fromDates.map((d) => <option key={d} value={d}>{formatDateShort(d)}</option>)}
          </select>
          <span className="text-muted-foreground">~</span>
          <span className="text-xs text-muted-foreground">종료</span>
          <select value={toYear} onChange={(e) => onToYearChange(e.target.value)} className={selectCls}>
            {years.filter((y) => y >= fromYear).map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select value={toDate} onChange={(e) => onToDateChange(e.target.value)} className={selectCls}>
            {toDates.map((d) => <option key={d} value={d}>{formatDateShort(d)}</option>)}
          </select>
        </div>
      </div>
    );
  }

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

        {/* Period selectors */}
        <Card className="border-card-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground">기간 설정</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-9 w-full rounded-md" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ) : gameDates.length === 0 ? (
              <p className="text-sm text-muted-foreground">게임 데이터가 없습니다</p>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                  <PeriodSelector
                    label="기준 기간"
                    labelColor="text-blue-600"
                    fromYear={baseFromYear} fromDate={baseFromDate}
                    toYear={baseToYear} toDate={baseToDate}
                    onFromYearChange={handleBaseFromYearChange}
                    onFromDateChange={setBaseFromDate}
                    onToYearChange={handleBaseToYearChange}
                    onToDateChange={setBaseToDate}
                  />
                </div>
                <div className="p-3 rounded-xl bg-violet-50 border border-violet-100">
                  <PeriodSelector
                    label="비교 기간"
                    labelColor="text-violet-600"
                    fromYear={cmpFromYear} fromDate={cmpFromDate}
                    toYear={cmpToYear} toDate={cmpToDate}
                    onFromYearChange={handleCmpFromYearChange}
                    onFromDateChange={setCmpFromDate}
                    onToYearChange={handleCmpToYearChange}
                    onToDateChange={setCmpToDate}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card className="border-card-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              회원별 점수 비교
              {!loading && (
                <Badge variant="secondary" className="text-xs">{sortedStats.length}명</Badge>
              )}
              {baseFromDate && baseToDate && cmpFromDate && cmpToDate && (
                <span className="ml-auto flex items-center gap-2 text-[13px] font-medium">
                  <span className="text-blue-500">{formatDate(baseFromDate)} ~ {formatDate(baseToDate)}</span>
                  <span className="text-muted-foreground/40">vs</span>
                  <span className="text-violet-500">{formatDate(cmpFromDate)} ~ {formatDate(cmpToDate)}</span>
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
                      <th
                        className="text-right px-4 py-3 font-medium text-blue-500 cursor-pointer hover:text-blue-600 select-none"
                        onClick={() => handleSort("baseAvg")}
                      >
                        기준 평균 <SortIcon field="baseAvg" />
                      </th>
                      <th
                        className="text-right px-4 py-3 font-medium text-violet-500 cursor-pointer hover:text-violet-600 select-none"
                        onClick={() => handleSort("cmpAvg")}
                      >
                        비교 평균 <SortIcon field="cmpAvg" />
                      </th>
                      <th
                        className="text-right px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => handleSort("delta")}
                      >
                        변화 <SortIcon field="delta" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStats.map((s, idx) => {
                      const isUp = s.delta !== null && s.delta > 0;
                      const isDown = s.delta !== null && s.delta < 0;
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
                            {s.baseAvg !== null ? (
                              <div>
                                <span className={`font-semibold ${avgColor(s.baseAvg) || "text-blue-500"}`}>
                                  {s.baseAvg}
                                </span>
                                <span className="text-xs text-muted-foreground ml-0.5">점</span>
                                <div className="text-xs text-muted-foreground/50">{s.baseCount}게임</div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/40 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {s.cmpAvg !== null ? (
                              <div>
                                <span className={`font-semibold ${avgColor(s.cmpAvg) || "text-violet-500"}`}>
                                  {s.cmpAvg}
                                </span>
                                <span className="text-xs text-muted-foreground ml-0.5">점</span>
                                <div className="text-xs text-muted-foreground/50">{s.cmpCount}게임</div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/40 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {s.delta !== null ? (
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
                                {isUp ? "+" : ""}{s.delta}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40 text-xs">-</span>
                            )}
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
