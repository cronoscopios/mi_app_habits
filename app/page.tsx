"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

type Habit = { id: string; name: string; completedDates: string[]; createdAt: string };
type Dialog = { mode: "add" } | { mode: "edit"; id: string } | { mode: "delete"; id: string } | null;
type Notice = { text: string; kind: "success" | "error" } | null;
type LegacyHabit = { id?: unknown; name?: unknown; completedDates?: unknown; createdAt?: unknown };
type PendingMigration = { userId: string; habits: Habit[] };

const STORAGE_KEY = "ritmo-habits-v1";
const MIGRATION_KEY = "ritmo-habits-migration-v1";
const DAY_NAMES = ["L", "M", "X", "J", "V", "S", "D"];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function shiftDate(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function getWeek(today: Date) {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}

function getStreak(habit: Habit, today: Date) {
  const done = new Set(habit.completedDates);
  let cursor = done.has(dateKey(today)) ? new Date(today) : shiftDate(today, -1);
  if (!done.has(dateKey(cursor))) return 0;
  let streak = 0;
  while (done.has(dateKey(cursor))) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

function getBestStreak(habits: Habit[]) {
  let best = 0;
  for (const habit of habits) {
    const done = new Set(habit.completedDates);
    for (const key of habit.completedDates) {
      if (done.has(dateKey(shiftDate(dateFromKey(key), -1)))) continue;
      let length = 0;
      let cursor = dateFromKey(key);
      while (done.has(dateKey(cursor))) {
        length += 1;
        cursor = shiftDate(cursor, 1);
      }
      best = Math.max(best, length);
    }
  }
  return best;
}

function errorText(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "El correo o la contraseña no son correctos.";
  if (lower.includes("email not confirmed")) return "Confirma tu correo desde el mensaje que te envió Supabase.";
  if (lower.includes("user already registered")) return "Ya existe una cuenta con ese correo. Prueba iniciar sesión.";
  if (lower.includes("password should be at least")) return "La contraseña debe tener al menos 6 caracteres.";
  if (lower.includes("failed to fetch")) return "No pudimos conectar con Supabase. Revisa tu conexión y la URL del archivo .env.";
  if (lower.includes("relation") && lower.includes("does not exist")) return "Faltan las tablas de la app. Sigue los pasos de SUPABASE.md y ejecuta el archivo supabase/schema.sql.";
  return message;
}

async function migrateLocalHabits(client: NonNullable<ReturnType<typeof getSupabaseClient>>, userId: string) {
  let pending: PendingMigration | null = null;
  const staged = window.localStorage.getItem(MIGRATION_KEY);

  if (staged) {
    pending = JSON.parse(staged) as PendingMigration;
    if (pending.userId !== userId) {
      throw new Error("Hay hábitos pendientes de copiar para otra cuenta. Inicia sesión con la cuenta que usabas en este navegador para terminar la copia.");
    }
  } else {
    const legacy = window.localStorage.getItem(STORAGE_KEY);
    if (!legacy) return 0;
    const parsed: unknown = JSON.parse(legacy);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return 0;
    }
    const oldHabits = parsed as LegacyHabit[];
    const habits: Habit[] = oldHabits.filter((item) => typeof item.name === "string" && item.name.trim()).map((item) => ({
      id: crypto.randomUUID(),
      name: (item.name as string).trim().slice(0, 60),
      completedDates: Array.isArray(item.completedDates) ? item.completedDates.filter((date): date is string => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) : [],
      createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
    }));
    if (habits.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return 0;
    }
    pending = { userId, habits };
    window.localStorage.setItem(MIGRATION_KEY, JSON.stringify(pending));
  }

  const rows = pending.habits.map((habit) => ({ id: habit.id, user_id: userId, name: habit.name }));
  const { error: habitsError } = await client.from("habits").upsert(rows, { onConflict: "id" });
  if (habitsError) throw habitsError;

  const completions = pending.habits.flatMap((habit) => habit.completedDates.map((completed_on) => ({ habit_id: habit.id, completed_on })));
  if (completions.length > 0) {
    const { error: completionsError } = await client.from("habit_completions").upsert(completions, { onConflict: "habit_id,completed_on" });
    if (completionsError) throw completionsError;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(MIGRATION_KEY);
  return pending.habits.length;
}

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "spark") return <svg {...common}><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></svg>;
  if (name === "book") return <svg {...common}><path d="M12 7v14"/><path d="M3 18V5a2 2 0 0 1 2-2h3a4 4 0 0 1 4 4 4 4 0 0 1 4-4h3a2 2 0 0 1 2 2v13h-5a4 4 0 0 0-4 3 4 4 0 0 0-4-3H3Z"/></svg>;
  if (name === "calendar") return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>;
  if (name === "flame") return <svg {...common}><path d="M12 22c4.4 0 7-3.3 7-7.3 0-2.3-1.3-5-3.8-7.7 0 3-1.7 4.2-2.8 4.5.2-3.3-1.2-6.1-4.1-8.5.2 4.4-4.3 7.5-4.3 12A7.7 7.7 0 0 0 12 22Z"/><path d="M12 18.8c1.5 0 2.5-1.1 2.5-2.5 0-1-.6-2-1.5-2.8-.1 1.1-.7 1.6-1.3 1.8 0-1.1-.5-1.8-1.4-2.5.1 1.5-1 2.3-1 3.6a2.7 2.7 0 0 0 2.7 2.4Z"/></svg>;
  if (name === "check") return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if (name === "edit") return <svg {...common}><path d="m16 4 4 4M4 20l4-.8L19.5 7.7a2.1 2.1 0 0 0-3-3L5 16.2 4 20Z"/></svg>;
  if (name === "trash") return <svg {...common}><path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg>;
  if (name === "close") return <svg {...common}><path d="m18 6-12 12M6 6l12 12"/></svg>;
  if (name === "lock") return <svg {...common}><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>;
  if (name === "home") return <svg {...common}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/></svg>;
  if (name === "chart") return <svg {...common}><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-6"/></svg>;
  if (name === "logout") return <svg {...common}><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg>;
  if (name === "mail") return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
}

export default function Home() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<Notice>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataBusy, setDataBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [habitName, setHabitName] = useState("");
  const [today, setToday] = useState<Date | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    setToday(new Date());
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      setAuthMessage(null);
      setNotice(null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      if (!supabase || !userId) {
        setHabits([]);
        setDataLoading(false);
        return;
      }

      setDataLoading(true);
      setNotice(null);
      let imported = 0;
      try {
        imported = await migrateLocalHabits(supabase, userId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "No pudimos copiar los hábitos guardados en este navegador.";
        if (!cancelled) setNotice({ kind: "error", text: `La copia de tus hábitos no terminó: ${errorText(message)}. Conservamos la copia de este navegador para que puedas intentarlo otra vez.` });
      }

      try {
        const { data: habitRows, error: habitsError } = await supabase.from("habits").select("id, name, created_at").order("created_at", { ascending: true });
        if (habitsError) throw habitsError;
        const ids = (habitRows ?? []).map((row) => row.id as string);
        let completionRows: { habit_id: string; completed_on: string }[] = [];
        if (ids.length > 0) {
          const { data, error } = await supabase.from("habit_completions").select("habit_id, completed_on").in("habit_id", ids);
          if (error) throw error;
          completionRows = (data ?? []) as typeof completionRows;
        }
        if (cancelled) return;
        setHabits((habitRows ?? []).map((row) => ({
          id: row.id as string,
          name: row.name as string,
          createdAt: row.created_at as string,
          completedDates: completionRows.filter((item) => item.habit_id === row.id).map((item) => item.completed_on),
        })));
        if (imported > 0) setNotice({ kind: "success", text: `Copiamos ${imported} ${imported === 1 ? "hábito" : "hábitos"} de este navegador a tu cuenta.` });
      } catch (error) {
        if (!cancelled) setNotice({ kind: "error", text: `No pudimos cargar tus hábitos: ${errorText(error instanceof Error ? error.message : "Error de conexión")}` });
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }
    void loadData();
    return () => { cancelled = true; };
  }, [userId, supabase]);

  const week = useMemo(() => (today ? getWeek(today) : []), [today]);
  const todayKey = today ? dateKey(today) : "";
  const completedToday = habits.filter((habit) => habit.completedDates.includes(todayKey)).length;
  const completedThisWeek = habits.reduce((total, habit) => total + habit.completedDates.filter((key) => week.some((day) => dateKey(day) === key)).length, 0);
  const bestStreak = getBestStreak(habits);
  const weeklyCounts = week.map((day) => habits.reduce((count, habit) => count + Number(habit.completedDates.includes(dateKey(day))), 0));
  const maxWeekCount = Math.max(1, ...weeklyCounts);
  const todayLabel = today ? new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(today) : "";
  const firstName = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage(null);
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email: email.trim(), password })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setAuthBusy(false);
    if (result.error) {
      setAuthMessage({ kind: "error", text: errorText(result.error.message) });
    } else if (authMode === "signup" && !result.data.session) {
      setAuthMessage({ kind: "success", text: "Cuenta creada. Revisa tu correo para confirmar la dirección y luego inicia sesión." });
      setAuthMode("login");
    } else if (authMode === "signup") {
      setAuthMessage({ kind: "success", text: "Tu cuenta está lista." });
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setNotice({ kind: "error", text: errorText(error.message) });
  }

  function openAdd() {
    setHabitName("");
    setDialog({ mode: "add" });
  }

  function openEdit(habit: Habit) {
    setHabitName(habit.name);
    setDialog({ mode: "edit", id: habit.id });
  }

  async function saveHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session?.user) return;
    const name = habitName.trim();
    if (!name) return;
    setDataBusy(true);
    if (dialog?.mode === "edit") {
      const { error } = await supabase.from("habits").update({ name }).eq("id", dialog.id).eq("user_id", session.user.id);
      if (error) setNotice({ kind: "error", text: `No pudimos guardar el cambio: ${errorText(error.message)}` });
      else {
        setHabits((current) => current.map((habit) => habit.id === dialog.id ? { ...habit, name } : habit));
        setNotice(null);
        setDialog(null);
      }
    } else {
      const { data, error } = await supabase.from("habits").insert({ user_id: session.user.id, name }).select("id, name, created_at").single();
      if (error) setNotice({ kind: "error", text: `No pudimos guardar el hábito: ${errorText(error.message)}` });
      else {
        setHabits((current) => [...current, { id: data.id, name: data.name, createdAt: data.created_at, completedDates: [] }]);
        setNotice(null);
        setDialog(null);
      }
    }
    setDataBusy(false);
  }

  async function toggleDay(habitId: string, key: string) {
    if (!supabase) return;
    const habit = habits.find((item) => item.id === habitId);
    if (!habit) return;
    setDataBusy(true);
    const isComplete = habit.completedDates.includes(key);
    const result = isComplete
      ? await supabase.from("habit_completions").delete().eq("habit_id", habitId).eq("completed_on", key)
      : await supabase.from("habit_completions").insert({ habit_id: habitId, completed_on: key });
    if (result.error) setNotice({ kind: "error", text: `No pudimos guardar el día: ${errorText(result.error.message)}` });
    else {
      setHabits((current) => current.map((item) => item.id !== habitId ? item : {
        ...item,
        completedDates: isComplete ? item.completedDates.filter((date) => date !== key) : [...item.completedDates, key],
      }));
      setNotice(null);
    }
    setDataBusy(false);
  }

  async function confirmDelete() {
    if (!supabase || dialog?.mode !== "delete") return;
    setDataBusy(true);
    const { error } = await supabase.from("habits").delete().eq("id", dialog.id).eq("user_id", session?.user.id);
    if (error) setNotice({ kind: "error", text: `No pudimos borrar el hábito: ${errorText(error.message)}` });
    else {
      setHabits((current) => current.filter((habit) => habit.id !== dialog.id));
      setNotice(null);
      setDialog(null);
    }
    setDataBusy(false);
  }

  if (!authReady) return <div className="loading-screen"><div className="brand-mark"><Icon name="spark" size={19} /></div><span>Cargando tu espacio…</span></div>;

  if (!supabase) return <div className="auth-page"><div className="auth-card"><Brand /><div className="auth-eyebrow">Un pequeño paso cada día</div><h1>Conecta tu cuenta</h1><p className="auth-intro">Completa la URL y la clave pública de Supabase en el archivo <strong>.env</strong>, guarda el archivo y vuelve a iniciar la app.</p><div className="notice error"><Icon name="lock" size={15} /> Sigue los pasos de <strong>SUPABASE.md</strong> para encontrar tus datos.</div></div></div>;

  if (!session) return <div className="auth-page"><div className="auth-card"><Brand /><div className="auth-eyebrow">Un pequeño paso cada día</div><h1>{authMode === "login" ? "Qué bueno verte." : "Empieza a tu ritmo."}</h1><p className="auth-intro">{authMode === "login" ? "Inicia sesión para continuar con tus hábitos de aprendizaje." : "Crea una cuenta para guardar tus hábitos y ver tu progreso."}</p>
    <div className="auth-tabs"><button className={authMode === "login" ? "selected" : ""} onClick={() => { setAuthMode("login"); setAuthMessage(null); }}>Iniciar sesión</button><button className={authMode === "signup" ? "selected" : ""} onClick={() => { setAuthMode("signup"); setAuthMessage(null); }}>Crear cuenta</button></div>
    <form onSubmit={submitAuth}><label className="field-label" htmlFor="email">Correo electrónico</label><div className="auth-input-wrap"><Icon name="mail" size={16} /><input required id="email" type="email" autoComplete="email" placeholder="tu@correo.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div><label className="field-label password-label" htmlFor="password">Contraseña</label><input required id="password" className="text-field" type="password" minLength={6} autoComplete={authMode === "login" ? "current-password" : "new-password"} placeholder="Al menos 6 caracteres" value={password} onChange={(event) => setPassword(event.target.value)} />
      {authMessage && <div className={`notice ${authMessage.kind}`}>{authMessage.text}</div>}<button className="primary-btn auth-submit" disabled={authBusy}>{authBusy ? "Un momento…" : authMode === "login" ? "Iniciar sesión" : "Crear mi cuenta"}</button></form>
    <div className="auth-privacy"><Icon name="lock" size={13} /> Tus hábitos se guardan de forma privada en tu cuenta</div></div></div>;

  return <div className="app-shell">
    <aside className="sidebar"><Brand /><div className="side-label">Mi espacio</div><div className="side-link active"><Icon name="home" size={16} /> Mis hábitos</div><div className="side-link"><Icon name="chart" size={16} /> Mi semana</div><div className="side-quote"><div className="side-quote-icon"><Icon name="spark" size={16} /></div><p>Un poco cada día se convierte en mucho con el tiempo.</p><small>Tu recordatorio amable</small></div><div className="side-footer">Tus hábitos están protegidos<br />por tu cuenta de Ritmo 🌱</div></aside>
    <main className="main-area"><div className="main-inner">
      <header className="topbar"><div className="date-label"><Icon name="calendar" size={15} />{todayLabel ? firstName(todayLabel) : ""}</div><div className="account-actions"><span className="account-email" title={session.user.email}>{session.user.email}</span><button className="signout-btn" onClick={signOut}><Icon name="logout" size={14} /><span>Cerrar sesión</span></button></div></header>
      <section className="welcome-row"><div><p className="eyebrow">Tu camino de hoy</p><h1 className="page-title">Aprender, a tu ritmo.</h1><p className="page-subtitle">Cada pequeño paso cuenta. ¿Qué te gustaría practicar hoy?</p></div><button className="primary-btn" onClick={openAdd}><Icon name="plus" size={16} /> Nuevo hábito</button></section>
      {notice && <div className={`notice page-notice ${notice.kind}`}>{notice.text}<button aria-label="Cerrar mensaje" onClick={() => setNotice(null)}><Icon name="close" size={14} /></button></div>}
      <section className="stats-grid" aria-label="Resumen de tus hábitos"><Stat label="Mis hábitos" value={habits.length} note="en tu lista" icon="book" /><Stat label="Hoy cumplidos" value={`${completedToday} / ${habits.length}`} note={completedToday === habits.length && habits.length > 0 ? "¡Todo listo por hoy!" : "un paso a la vez"} icon="check" /><Stat label="Mejor racha" value={bestStreak} note={bestStreak === 1 ? "día seguido" : "días seguidos"} icon="flame" /><Stat label="Esta semana" value={completedThisWeek} note={completedThisWeek === 1 ? "hábito completado" : "hábitos completados"} icon="calendar" /></section>
      <section className="section-grid" aria-label="Resumen de la semana"><div className="panel week-panel"><div className="panel-heading"><div><h2 className="panel-title">Tu semana</h2><p className="panel-subtitle">Hábitos que completaste cada día</p></div><div className="week-total">{completedThisWeek} en total</div></div><div className="week-chart">{week.map((day, index) => { const count = weeklyCounts[index]; const height = count ? Math.max(12, (count / maxWeekCount) * 100) : 4; const isToday = dateKey(day) === todayKey; return <div className="chart-day" key={dateKey(day)}><span className="chart-count">{count || "·"}</span><div className="bar-track"><div className={`bar-fill${isToday ? " today" : ""}`} style={{ height: `${height}%` }} /></div><span className="chart-label" style={isToday ? { color: "#416b50", fontWeight: 700 } : undefined}>{DAY_NAMES[index]}</span></div>; })}</div></div>
        <div className="panel today-panel"><div><div className="today-label">Tu constancia de hoy</div><div className="today-count">{habits.length ? `${Math.round((completedToday / habits.length) * 100)}%` : "De a poco"}</div><div className="today-copy">{habits.length ? `${completedToday} de ${habits.length} hábitos completados` : "Empieza con un hábito pequeño."}</div></div><div className="progress-track"><div className="progress-fill" style={{ width: `${habits.length ? (completedToday / habits.length) * 100 : 0}%` }} /></div></div></section>
      <section className="panel habit-panel" aria-label="Lista de hábitos"><div className="habit-header"><div><h2 className="panel-title">Mis hábitos</h2><p className="panel-subtitle">Marca los días en que cumpliste</p></div><span className="week-legend">Lun — Dom</span></div>
        {dataLoading ? <div className="empty-state"><div className="empty-mark"><Icon name="spark" size={19} /></div><h3>Cargando tus hábitos…</h3></div> : habits.length === 0 ? <div className="empty-state"><div className="empty-mark"><Icon name="book" size={19} /></div><h3>Tu lista empieza aquí</h3><p>Agrega algo que quieras aprender y marca cada día que le dediques un ratito.</p><button className="empty-add" onClick={openAdd}>+ Agregar mi primer hábito</button></div> : habits.map((habit) => <div className="habit-row" key={habit.id}><div className="habit-info"><div className="habit-name" title={habit.name}>{habit.name}</div><div className="habit-meta"><span className="streak"><Icon name="flame" size={12} />{getStreak(habit, today ?? new Date())} {getStreak(habit, today ?? new Date()) === 1 ? "día" : "días"}</span><span>de racha</span></div></div><div className="week-dots" aria-label={`Días de la semana para ${habit.name}`}>{week.map((day, index) => { const key = dateKey(day); const complete = habit.completedDates.includes(key); const isToday = key === todayKey; return <button key={key} type="button" disabled={dataBusy || key > todayKey} className={`day-toggle${complete ? " complete" : ""}${isToday ? " is-today" : ""}`} aria-label={`${DAY_NAMES[index]}${isToday ? ", hoy" : ""}: ${complete ? "cumplido, desmarcar" : "pendiente, marcar como cumplido"}`} aria-pressed={complete} title={`${day.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "short" })}${isToday ? " · hoy" : key > todayKey ? " · todavía no llegó" : ""}`} onClick={() => void toggleDay(habit.id, key)}><span className="day-letter">{DAY_NAMES[index]}</span><span className="day-dot">{complete && <Icon name="check" size={13} />}</span></button>; })}</div><div className="habit-actions"><button className="icon-button" disabled={dataBusy} aria-label={`Editar ${habit.name}`} title="Editar" onClick={() => openEdit(habit)}><Icon name="edit" size={14} /></button><button className="icon-button danger" disabled={dataBusy} aria-label={`Borrar ${habit.name}`} title="Borrar" onClick={() => setDialog({ mode: "delete", id: habit.id })}><Icon name="trash" size={14} /></button></div></div>)}
      </section><div className="privacy-note"><Icon name="lock" size={12} /> Tus hábitos se guardan en Supabase, protegidos por tu cuenta</div>
    </div></main>

    {(dialog?.mode === "add" || dialog?.mode === "edit") && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><form className="modal" role="dialog" aria-modal="true" aria-labelledby="habit-dialog-title" onSubmit={(event) => void saveHabit(event)}><div className="modal-head"><div><h2 id="habit-dialog-title">{dialog.mode === "add" ? "Un hábito nuevo" : "Editar hábito"}</h2><p className="modal-copy">Algo pequeño que te gustaría hacer para aprender.</p></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={() => setDialog(null)}><Icon name="close" size={16} /></button></div><label className="field-label" htmlFor="habit-name">Nombre del hábito</label><input autoFocus id="habit-name" className="text-field" maxLength={60} placeholder="Por ejemplo, leer 20 minutos" value={habitName} onChange={(event) => setHabitName(event.target.value)} /><div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setDialog(null)}>Cancelar</button><button type="submit" className="primary-btn" disabled={dataBusy || !habitName.trim()}>{dataBusy ? "Guardando…" : dialog.mode === "add" ? "Agregar hábito" : "Guardar cambios"}</button></div></form></div>}
    {dialog?.mode === "delete" && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title"><div className="modal-head"><div><h2 id="delete-dialog-title">¿Borrar este hábito?</h2><p className="modal-copy">También se borrará su historial. Esta acción no se puede deshacer.</p></div><button className="icon-button" aria-label="Cerrar" onClick={() => setDialog(null)}><Icon name="close" size={16} /></button></div><div className="modal-actions"><button className="secondary-btn" onClick={() => setDialog(null)}>Cancelar</button><button className="primary-btn" disabled={dataBusy} style={{ background: "#aa5b50" }} onClick={() => void confirmDelete()}>{dataBusy ? "Borrando…" : "Sí, borrar"}</button></div></div></div>}
  </div>;
}

function Brand() {
  return <div className="brand"><div className="brand-mark"><Icon name="spark" size={19} /></div><div><div className="brand-name">ritmo</div><div className="brand-caption">tu espacio para aprender</div></div></div>;
}

function Stat({ label, value, note, icon }: { label: string; value: string | number; note: string; icon: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon name={icon} size={14} /></span></div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>;
}
