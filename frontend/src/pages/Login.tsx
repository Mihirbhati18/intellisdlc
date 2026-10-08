import { Loader2, LogIn } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { errorMessage } from "../api";
import { useAuth } from "../auth";
import { Field, inputClass } from "../components/ui";

const DEMO_ACCOUNTS = [
  { label: "Project Manager", email: "pm@intellisdlc.dev", hint: "Priya - full access" },
  { label: "Admin", email: "admin@intellisdlc.dev", hint: "Mihir - everything" },
  { label: "Developer", email: "kabir@intellisdlc.dev", hint: "Kabir - own tasks" },
  { label: "QA Engineer", email: "qa@intellisdlc.dev", hint: "Rahul - bugs and tests" },
];

const DEMO_PASSWORD = "Demo@123";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("pm@intellisdlc.dev");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(nextEmail = email, nextPassword = password) {
    setBusy(true);
    setError("");
    try {
      await login(nextEmail, nextPassword);
      navigate("/", { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-base font-bold text-white">
            iS
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">IntelliSDLC</h1>
          <p className="mt-1 text-sm text-slate-500">
            Requirements, sprints and intelligence in one place
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClass}
                autoComplete="username"
                required
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={inputClass}
                autoComplete="current-password"
                required
              />
            </Field>

            {error && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {busy ? "Signing in" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Demo accounts (password {DEMO_PASSWORD})
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(DEMO_PASSWORD);
                    void submit(account.email, DEMO_PASSWORD);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-60"
                >
                  <span className="block text-sm font-medium text-slate-700">{account.label}</span>
                  <span className="block text-xs text-slate-400">{account.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
