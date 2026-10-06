import { useEffect, useState } from "react"

import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom"

import BranchedMenu from "./BranchedMenu"

import CometDial from "./CometDial"

import { Badge, Button, EmptyState, Icon, SectionHeader } from "./components/ui"

import { LeadsPage } from "./features/leads"

import { useSessionLeads } from "./features/leads/hooks/useSessionLeads"

import Prism from "./Prism"

import { LEAD_STATUSES } from "./types"

type ViewPage = "Dashboard" | "Discovery" | "Audits" | "Automation" | "Settings" | "Analytics"

type RoutePageProps = {
  page: ViewPage
}

function Sidebar({
  page,
  onNavigate,
  open,
  close,
}: {
  page: string
  onNavigate: (path: string) => void
  open: boolean
  close: () => void
}) {
  const navigation = [
    {
      label: "Overview",
      children: [
        {
          value: "/dashboard",
          label: "Dashboard",
          icon: <Icon name="dashboard" />,
        },
      ],
    },

    {
      label: "Intelligence",
      children: [
        { value: "/leads", label: "Leads", icon: <Icon name="leads" /> },
        {
          value: "/discovery",
          label: "Discovery",
          icon: <Icon name="discovery" />,
        },
        { value: "/audits", label: "Audits", icon: <Icon name="audit" /> },
        {
          value: "/analytics",
          label: "Analytics",
          icon: <Icon name="analytics" />,
        },
      ],
    },

    {
      label: "Operations",
      children: [
        {
          value: "/automation",
          label: "Automation",
          icon: <Icon name="automation" />,
        },
      ],
    },

    {
      label: "Workspace",
      children: [
        {
          value: "/settings",
          label: "Settings",
          icon: <Icon name="settings" />,
        },
      ],
    },
  ]

  return (
    <>
      {open && <div className="scrim" onClick={close} />}
      <aside
        id="primary-sidebar"
        className={`sidebar ${open ? "sidebar-open" : ""}`}
      >
        <div className="sidebar-nav-shell">
          <div className="brand">
            <button
              className="brand-home"
              onClick={() => {
                onNavigate("/dashboard")
                if (window.matchMedia("(max-width: 900px)").matches) close()
              }}
              aria-label="Go to dashboard"
            >
              <span className="brand-mark">B</span>
              <span className="brand-copy">
                <strong>BANELE.DEV</strong>
                <span>LEAD INTELLIGENCE</span>
              </span>
            </button>
            <button
              className="mobile-close"
              onClick={close}
              aria-label="Hide sidebar"
              title="Hide sidebar"
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="workspace-label">WORKSPACE</div>
          <BranchedMenu
            items={navigation}
            defaultOpen={[0, 1, 2, 3]}
            defaultActive="/dashboard"
            activeValue={page}
            onSelect={(value) => {
              onNavigate(value)
              if (window.matchMedia("(max-width: 900px)").matches) close()
            }}
            color="#f5f5f5"
            accentColor="#ed1c2e"
            lineColor="#3f3f46"
            width={224}
            rowHeight={36}
            indent={38}
            trunk={14}
            radius={9}
            lineWidth={1.5}
            fontSize={12}
            drawDuration={400}
            foldDuration={300}
          />
        </div>
        <div className="sidebar-foot">
          <div className="system-status">
            <span className="pulse" />
            <div>
              <strong>Frontend only</strong>
              <small>No services connected</small>
            </div>
          </div>
          <button className="profile">
            <span className="avatar">B</span>
            <span>
              <strong>Workspace</strong>
              <small>Local session</small>
            </span>
            <Icon name="more" />
          </button>
        </div>
      </aside>
    </>
  )
}

function Header({
  page,
  onMenu,
  sidebarVisible,
}: {
  page: string
  onMenu: () => void
  sidebarVisible: boolean
}) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <button
          className="menu-button"
          onClick={onMenu}
          aria-label={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
          title={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
          aria-expanded={sidebarVisible}
          aria-controls="primary-sidebar"
        >
          <Icon name="menu" />
        </button>
        <span>Intelligence</span>
        <Icon name="chevron" size={13} />
        <strong>{page}</strong>
      </div>
      <div className="topbar-actions">
        <div className="global-search">
          <Icon name="search" size={16} />
          <input placeholder="Search businesses, leads..." />
          <kbd>⌘ K</kbd>
        </div>
        <button className="icon-button">
          <Icon name="bell" />
        </button>
      </div>
    </header>
  )
}

function StatCard({
  label,
  value,
  change,
  accent,
}: {
  label: string
  value: string
  change: string
  accent?: boolean
}) {
  return (
    <div className={`stat-card ${accent ? "stat-accent" : ""}`}>
      <div className="stat-top">
        <span>{label}</span>
        <Icon name="arrow" size={15} />
      </div>
      <strong>{value}</strong>
      <div className="stat-change">
        <span>{change}</span>
      </div>
    </div>
  )
}

function Dashboard({
  leads,
  navigate,
}: {
  leads: ReturnType<typeof useSessionLeads>["leads"]
  navigate: (path: string) => void
}) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE OVERVIEW</p>
          <h1>Lead intelligence</h1>
          <p>
            Your pipeline starts with real business records. No sample data is
            loaded.
          </p>
        </div>
        <Button icon="leads" onClick={() => navigate("/leads")}>
          Manage leads
        </Button>
      </div>
      <div className="stats-grid">
        <StatCard
          label="TOTAL LEADS"
          value={String(leads.length)}
          change="Current session"
        />
        <StatCard
          label="QUALIFIED"
          value={String(
            leads.filter((lead) => lead.status === "QUALIFIED").length,
          )}
          change="Current session"
        />
        <StatCard
          label="HOT OPPORTUNITIES"
          value="—"
          change="No scoring results"
          accent
        />
        <StatCard
          label="CONVERSION RATE"
          value="—"
          change="No conversion data"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel span-7">
          <SectionHeader
            title="Lead pipeline"
            meta={`${leads.length} leads across all stages`}
          />
          <div className="pipeline">
            {LEAD_STATUSES.map((stage) => (
              <div className="pipeline-row" key={stage}>
                <span>{stage}</span>
                <div className="pipeline-track" />
                <strong>
                  {leads.filter((lead) => lead.status === stage).length}
                </strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel span-5">
          <SectionHeader title="Opportunity distribution" />
          <EmptyState
            title="No scores yet"
            text="Deterministic scoring must be completed before AI analysis."
            icon="analytics"
          />
        </section>
        <section className="panel span-8">
          <SectionHeader title="Highest opportunities" />
          <EmptyState
            title="No ranked opportunities"
            text="Rankings will appear when verified scoring results are available."
          />
        </section>
        <section className="panel span-4">
          <SectionHeader title="Requires action" />
          <EmptyState
            title="No pending approvals"
            text="Outreach always requires a human to review and approve the message."
            icon="mail"
          />
        </section>
      </div>
      <div className="lower-grid">
        <section className="panel">
          <SectionHeader title="Recent activity" />
          <EmptyState
            title="No recorded activity"
            text="No discovery, audits, or outreach have been performed."
            icon="clock"
          />
        </section>
        <section className="panel">
          <SectionHeader title="Automation health" />
          <EmptyState
            title="Services not connected"
            text="This frontend does not run automation engines."
            icon="automation"
          />
        </section>
      </div>
    </div>
  )
}

function WorkspacePage({ page }: RoutePageProps) {
  const descriptions: Record<ViewPage, string> = {
    Dashboard: "",
    Discovery: "Discover and enrich businesses from configured sources.",
    Audits: "Evaluate digital presence before deterministic scoring.",
    Automation: "Monitor workflows with human-approved outreach.",
    Settings: "",
    Analytics: "",
  }

  const cards: Record<ViewPage, [string, string, "discovery" | "audit" | "automation" | "analytics" | "clock" | "mail"][]> =
    {
      Dashboard: [],
      Discovery: [
        ["Discovery sources", "No sources connected", "discovery"],
        ["Recent runs", "No discovery runs", "clock"],
      ],
      Audits: [
        ["Digital audits", "No audit results", "audit"],
        ["Scoring results", "No deterministic scores", "analytics"],
      ],
      Automation: [
        ["Workflow queue", "No jobs queued", "automation"],
        ["Outreach approvals", "No messages awaiting approval", "mail"],
      ],
      Settings: [],
      Analytics: [],
    }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE</p>
          <h1>{page}</h1>
          <p>{descriptions[page]}</p>
        </div>
        <Badge>NOT CONNECTED</Badge>
      </div>
      <div className="lower-grid">
        {cards[page].map(([title, empty, icon]) => (
          <section className="panel" key={title}>
            <SectionHeader title={title} />
            <EmptyState
              title={empty}
              text="No backend services are connected. This frontend cannot execute jobs or generate results."
              icon={icon}
            />
          </section>
        ))}
      </div>
      <p className="mt-6 text-xs text-[#a5a5a5]">
        Deterministic scoring precedes AI analysis. Sending outreach requires
        explicit human approval.
      </p>
    </div>
  )
}

function AnalyticsPage() {
  const metrics = [
    {
      title: "Conversion rate",
      unit: "%",
      max: 100,
      meta: "No conversion data",
    },

    {
      title: "Outreach sent",
      unit: "",
      max: 1000,
      meta: "Count · messages sent",
    },

    {
      title: "Meetings booked",
      unit: "",
      max: 100,
      meta: "Count · meetings booked",
    },

    { title: "Reply rate", unit: "%", max: 100, meta: "No outreach data" },
  ]

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PERFORMANCE</p>
          <h1>Analytics</h1>
          <p>No activity metrics are available yet.</p>
        </div>
      </div>
      <div className="stats-grid">
        {metrics.map((metric) => (
          <section className="panel reply-rate-dial-card" key={metric.title}>
            <SectionHeader title={metric.title} meta={metric.meta} />
            <CometDial
              defaultValue={0}
              min={0}
              max={metric.max}
              step={1}
              unit={metric.unit}
              label={metric.title}
              accent="#ed1c2e"
              size={160}
            />
          </section>
        ))}
      </div>
      <div className="lower-grid">
        <section className="panel">
          <SectionHeader title="Pipeline performance" />
          <EmptyState
            title="No performance data"
            text="Metrics will appear when real activity is available."
            icon="analytics"
          />
        </section>
        <section className="panel">
          <SectionHeader title="Lead sources" />
          <EmptyState
            title="No source data"
            text="No discovery source has supplied records."
            icon="discovery"
          />
        </section>
      </div>
    </div>
  )
}

function SettingsPage() {
  const [section, setSection] = useState("General")

  const items = [
    "General",
    "Sources",
    "Scoring Rules",
    "AI Models",
    "Automation",
    "Notifications",
    "User / Profile",
  ]

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONFIGURATION</p>
          <h1>Settings</h1>
          <p>
            Frontend-only workspace. No credentials, providers, or saved
            configuration.
          </p>
        </div>
      </div>
      <div className="settings-layout">
        <aside className="settings-nav">
          {items.map((item) => (
            <button
              className={section === item ? "active" : ""}
              onClick={() => setSection(item)}
              key={item}
            >
              {item}
              <Icon name="chevron" size={14} />
            </button>
          ))}
        </aside>
        <section className="panel settings-panel">
          <SectionHeader title={section} />
          {section === "Scoring Rules" ? (
            <div className="p-5 text-sm leading-7 text-[#a5a5a5]">
              <p>
                Scores must list verified factors, their weights, and the
                resulting total. Unknown evidence must never be treated as a
                confirmed opportunity.
              </p>
              <p>
                No scoring rules are configured, and no scoring engine is
                connected.
              </p>
              <p>
                AI analysis follows validated deterministic scoring. Outreach
                requires human approval.
              </p>
            </div>
          ) : (
            <EmptyState
              title={
                section === "General" ? "Local session only" : "Not configured"
              }
              text="No backend is connected. Session records are held in memory and cleared on refresh."
              icon="settings"
            />
          )}
        </section>
      </div>
    </div>
  )
}

function AppContent() {
  const location = useLocation()

  const navigate = useNavigate()

  const leads = useSessionLeads()

  const [sidebarVisible, setSidebarVisible] = useState(
    () => window.matchMedia("(min-width: 901px)").matches,
  )

  const route = location.pathname.replace(/^\/+|\/+$/g, "") || "dashboard"

  const title =
    route === "dashboard"
      ? "Dashboard"
      : route.charAt(0).toUpperCase() + route.slice(1)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarVisible(false)
    }

    window.addEventListener("keydown", onKeyDown)

    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <div
      className={`app-shell relative isolate ${
        sidebarVisible ? "" : "sidebar-hidden"
      }`}
    >
      <div
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black"
        aria-hidden="true"
      >
        <div className="absolute inset-0 opacity-50">
          <Prism
            animationType="rotate"
            timeScale={0.5}
            height={3.5}
            baseWidth={5.5}
            scale={3.6}
            hueShift={0}
            colorFrequency={1}
            noise={0.5}
            glow={1}
          />
        </div>
        <div className="absolute inset-0 bg-black/40" />
      </div>
      {sidebarVisible && (
        <Sidebar
          page={`/${route}`}
          onNavigate={navigate}
          open
          close={() => setSidebarVisible(false)}
        />
      )}
      <main>
        <Header
          page={title}
          sidebarVisible={sidebarVisible}
          onMenu={() => setSidebarVisible((visible) => !visible)}
        />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={<Dashboard leads={leads.leads} navigate={navigate} />}
          />
          <Route path="/leads" element={<LeadsPage />} />
          <Route
            path="/discovery"
            element={<WorkspacePage page="Discovery" />}
          />
          <Route path="/audits" element={<WorkspacePage page="Audits" />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route
            path="/automation"
            element={<WorkspacePage page="Automation" />}
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="*"
            element={
              <div className="page">
                <EmptyState
                  title="Page not found"
                  text="The requested route is not available in this workspace."
                />
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppContent />
    </BrowserRouter>
  )
}
