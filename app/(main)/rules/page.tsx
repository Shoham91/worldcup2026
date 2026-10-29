import { requireUser } from "@/lib/auth";
import { POINTS, PRIZES } from "@/lib/points";

function Row({ label, pts }: { label: string; pts: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-700">{label}</span>
      <span className="font-bold tabular-nums text-emerald-700">{pts}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-2 font-bold">{title}</h2>
      {children}
    </div>
  );
}

export default async function RulesPage() {
  await requireUser();
  const k = POINTS.knockoutWinner;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Scoring &amp; Rules
        </h1>
        <p className="text-slate-500">How every point is earned.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="🔮 Title picks (champion / finalist / scorer)">
          <Row label="Champion correct" pts={`+${POINTS.signup.champion}`} />
          <Row label="Top scorer (Golden Boot) correct" pts={`+${POINTS.signup.topScorer}`} />
          <Row label="Your finalist reaches the final" pts={`+${POINTS.signup.finalist}`} />
          <p className="mt-2 text-xs text-slate-400">
            Locked the moment you register — highest risk, highest reward.
          </p>
        </Card>

        <Card title="📊 Group stage — who advances">
          <Row label="Each team correctly picked top-2" pts={`+${POINTS.group.advancer}`} />
          <Row label="Exact 1st & 2nd order in a group" pts={`+${POINTS.group.exactOrder}`} />
          <p className="mt-2 text-xs text-slate-400">
            3rd place isn&apos;t predicted — the best 3rd-placed teams appear in
            the Round of 32.
          </p>
        </Card>

        <Card title="🥅 Match scores (group + knockout)">
          <Row
            label="Exact scoreline"
            pts={`+${POINTS.score.exact} / +${POINTS.scoreLate.exact}`}
          />
          <Row
            label="Right result + right goal difference"
            pts={`+${POINTS.score.resultAndGd} / +${POINTS.scoreLate.resultAndGd}`}
          />
          <Row
            label="Right result (W/D/L) only"
            pts={`+${POINTS.score.result} / +${POINTS.scoreLate.result}`}
          />
          <p className="mt-2 text-xs text-slate-400">
            First value applies through the Round of 16, the second from the
            Quarter-finals on — sharper calls pay more in the late rounds.
            Graded on the 90-minute score; extra time &amp; penalties only
            decide who advances.
          </p>
        </Card>

        <Card title="🏆 Knockout — who advances">
          <Row label="Reach Round of 16 (win R32 tie)" pts={`+${k.R32}`} />
          <Row label="Reach Quarter-final" pts={`+${k.R16}`} />
          <Row label="Reach Semi-final" pts={`+${k.QF}`} />
          <Row label="Reach Final" pts={`+${k.SF}`} />
          <Row label="Win the Final" pts={`+${k.FINAL}`} />
          <Row label="Win the 3rd-place playoff (bronze match)" pts={`+${k.THIRD}`} />
          <p className="mt-2 text-xs text-slate-400">
            QF-onward values were rebalanced before the quarter-finals kicked
            off (QF 10→8, SF 15→12, Final 25→20, bronze 5→4) alongside the
            scoreline boost — games already played kept their original values.
          </p>
        </Card>
      </div>

      <Card title="💰 Prizes & tiebreakers">
        <p className="text-sm text-slate-700">
          Pot = number of players × 50 ILS. Split{" "}
          <b>{Math.round(PRIZES[0] * 100)}%</b> /{" "}
          <b>{Math.round(PRIZES[1] * 100)}%</b> /{" "}
          <b>{Math.round(PRIZES[2] * 100)}%</b> to 1st / 2nd / 3rd. The exact
          amounts are finalised once registration closes.
        </p>
        <p className="mt-2 text-sm text-slate-700">
          <b>Tiebreakers:</b> champion correct → top scorer correct → most
          correct knockout winners → name.
        </p>
      </Card>
    </div>
  );
}
