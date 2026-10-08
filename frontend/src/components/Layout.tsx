import {
  Bug as BugIcon,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Network,
  Rocket,
  ShieldAlert,
  SquareKanban,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import type { Role } from "../api";
import { useAuth } from "../auth";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/requirements", label: "Requirements", icon: <ClipboardList className="h-4 w-4" /> },
  { to: "/sprints", label: "Sprints", icon: <SquareKanban className="h-4 w-4" /> },
  { to: "/bugs", label: "Bugs", icon: <BugIcon className="h-4 w-4" /> },
  { to: "/test-cases", label: "Test Cases", icon: <FlaskConical className="h-4 w-4" /> },
  { to: "/deployments", label: "Deployments", icon: <Rocket className="h-4 w-4" /> },
  { to: "/traceability", label: "Traceability", icon: <Network className="h-4 w-4" /> },
  {
    to: "/risk",
    label: "Risk Predictor",
    icon: <ShieldAlert className="h-4 w-4" />,
    roles: ["ADMIN", "PROJECT_MANAGER"],
  },
  { to: "/chat", label: "AI Chat", icon: <MessageSquare className="h-4 w-4" /> },
];

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project Manager",
  DEVELOPER: "Developer",
  QA_ENGINEER: "QA Engineer",
};

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role));
  const initials = user.full_name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            iS
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">IntelliSDLC</p>
            <p className="text-xs text-slate-400">SDLC Management</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{user.full_name}</p>
              <p className="truncate text-xs text-slate-400">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 md:hidden">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                  isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-500"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </header>
        <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
