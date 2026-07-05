/**
 * Auto-settle points pools from the live feed.
 *
 * Settlement must be trustworthy — it comes from the result feed, never a user.
 * We subscribe to the manager's live-change stream (which fires for both the real
 * football feed AND the demo "full time" simulation), and the moment a fixture is
 * FINISHED with a final score, every open pool on that fixture pays out in points.
 */
import * as manager from '../pool/manager.js';
import { openPoolsForFixture, settlePool } from './pools.js';

export function startAutoSettle(): void {
  manager.onLiveChange((ids) => {
    for (const id of ids) {
      const s = manager.fixtureSummary(id);
      if (!s || s.matchStatus !== 'finished' || !s.result) continue;
      for (const p of openPoolsForFixture(id)) {
        try {
          settlePool(p.id, s.result);
          console.log(`[autosettle] pool ${p.code} settled ${s.result.homeGoals}-${s.result.awayGoals}`);
        } catch {
          /* already settled / concurrent — safe to ignore */
        }
      }
    }
  });
  console.log('[autosettle] watching the feed — pools pay out at full time');
}
