import { useLocation } from "wouter";
import { Target, Users } from "lucide-react";

const MENUS = [
  {
    path: "/score",
    icon: Target,
    title: "점수 비교",
    desc: "기간별 회원 평균 비교",
  },
  {
    path: "/team",
    icon: Users,
    title: "팀 짜기",
    desc: "균형 잡힌 팀 구성",
  },
];

export default function Home() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-[#f4f6fb] flex flex-col items-center pt-[18vh] px-6">
      <div className="w-full max-w-xl">
        <div className="grid grid-cols-2 gap-4">
          {MENUS.map((menu) => {
            const Icon = menu.icon;
            return (
              <button
                key={menu.path}
                data-testid={`menu-${menu.path.slice(1)}`}
                onClick={() => setLocation(menu.path)}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col items-center gap-3 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 cursor-pointer text-left"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#dce9fb] flex items-center justify-center">
                  <Icon className="w-7 h-7 text-[#4a90d9]" strokeWidth={1.7} />
                </div>
                <div className="text-center">
                  <p className="text-[15px] font-bold text-gray-800 mb-0.5">{menu.title}</p>
                  <p className="text-xs text-gray-400 leading-relaxed">{menu.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
