import { useLocation } from "wouter";
import { Target, Users } from "lucide-react";

const MENUS = [
  {
    path: "/score",
    icon: Target,
    title: "점수 비교",
    desc: "기간별 회원 평균 점수와 상승률을 확인합니다",
    color: "from-blue-500 to-blue-600",
    bg: "hover:bg-blue-50",
  },
  {
    path: "/team",
    icon: Users,
    title: "팀 짜기",
    desc: "회원들의 점수를 기반으로 균형 잡힌 팀을 구성합니다",
    color: "from-emerald-500 to-emerald-600",
    bg: "hover:bg-emerald-50",
  },
];

export default function Home() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-sidebar text-sidebar-foreground shadow-lg">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">볼링 대시보드</h1>
            <p className="text-xs text-sidebar-foreground/60 mt-0.5">점수 분석 & 팀 구성</p>
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl">
          <p className="text-center text-muted-foreground text-sm mb-10 tracking-wide uppercase font-medium">
            메뉴를 선택하세요
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {MENUS.map((menu) => {
              const Icon = menu.icon;
              return (
                <button
                  key={menu.path}
                  data-testid={`menu-${menu.path.slice(1)}`}
                  onClick={() => setLocation(menu.path)}
                  className={`group rounded-2xl border border-card-border bg-card shadow-sm p-8 flex flex-col items-center gap-4 transition-all duration-200 ${menu.bg} hover:shadow-md hover:-translate-y-0.5 cursor-pointer`}
                >
                  <div
                    className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${menu.color} flex items-center justify-center shadow-md`}
                  >
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-center">
                    <h2 className="text-lg font-bold mb-1">{menu.title}</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">{menu.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
