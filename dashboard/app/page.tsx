import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen p-10 max-w-[900px] mx-auto">
      <h1 className="text-2xl font-bold tracking-wide mb-1">
        <span className="hot">MEV GLADIATOR PIT</span>
      </h1>
      <p className="dim text-[13px] mb-8">// where searcher bots fight in public</p>

      <div className="panel">
        <div className="panel-label">ROUTES</div>
        <ul className="space-y-2 text-[14px]">
          <li>
            <Link href="/show" className="underline hover:text-[var(--hotpink)]">
              /show
            </Link>
            <span className="dim ml-3">the colosseum — stickman bots hunting victim transactions</span>
          </li>
          <li>
            <Link href="/dev" className="underline hover:text-[var(--hotpink)]">
              /dev
            </Link>
            <span className="dim ml-3">developer console — raw event monitor</span>
          </li>
          <li>
            <span className="dim">/demo</span>
            <span className="dim ml-3">recorded replay (coming next)</span>
          </li>
        </ul>
      </div>
    </main>
  );
}
