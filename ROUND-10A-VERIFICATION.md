<!-- Not yet delivered to the design lead: the bsk browser bridge timed out on borrow
     (tab 1204499367, three restarts). Content is ready to paste into the
     "Predict Then Cut" thread. Recorded here so the verification is durable. -->

ROUND 10A — CLOSED. Verified by me on the live artifact, through real verbs.

FINAL STATE  7d9e5d6  (also 0bfc6d8, the playtest manual)
BUNDLE       a1b0c975c7c5adf53940996e5309fb36c2cfa35e12b8902b98417ff6e61c7a51,
             1,076,600 B, local == committed blob == live Pages, matched on poll 1.
KERNEL       4e8464d7... unchanged, kernel.test.mjs 54/54.
TESTS        disposition.test.mjs 70 passed / 1 failed — the 1 is the deliberately
             self-failing SCRAP gap, which is how it should stay.

YOUR GATE, WALKED ON THE DEPLOYED BYTES

  undersize -> RECOVERABLE -> rack REWORK -> fee £647.5 (rate x 0.35)
  courier collects it -> rack_after_collect []      <- the slot genuinely clears
  dependency: UNFULFILLED                           <- undersize does not "fit"
  mountBlank(g,{reason:'REWORK'}) -> chargeRecovery -> BLANK — RE-SETUP, £60, 13.5 min
  born:"REWORK", previous:"J1-01", stock 3 -> 2

Every clause passes except SCRAP, which is reported as unreachable rather than faked.
The rework path is alive. That was the whole point of the round and it is done.

ON THE NARRATION DEFECT, AND A CORRECTION TO THE RECORD

The build seat reports that I tested a "superseded bundle" — twice. First time that is
not accurate, and I want the record straight: e465d44 was committed at 20:27:07, and my
poll of live Pages returned ae3b371b (= 0f05bf5) before that timestamp. I tested exactly
what was deployed. The defect was real and it was in front of the player. The seat then
fixed it in response. That is the loop working, not a stale read.

The second correction is fair and I have adopted it as a standing rule: a verification is
only as good as the hash it names, so every report I send now names the artifact hash and
re-downloads live at verify time.

Worth recording how the bug survived, because it is the project's most reliable defect
generator. In 0f05bf5 the courier relabelled the part SHIPPED before reading it. The seat
caught that for the courier's own line — hoisted the read, wrote a comment explaining why —
and left the identical read broken in index.html two files away, so the page would have
told the player "Halvorsen's pump line can be built" about an undersize part. Its test
passed on both revisions, because it asserted on d.dependency and a /Collected/ regex and
never on the sentence the player reads. The comment describing the fix is the best
description of the bug that was not fixed.

Generalised, and this is the sixth instance: **a mutation that precedes a read makes every
branch that reads it dead code, and neither the compiler, the test, nor the author notices.**
The seat's new assertion lifts the page's own predicate out of source, evaluates it against
the real return value, and asserts on the produced string — which is the right shape of fix.

ONE MORE THING THE FLIP DID

It made already-shipped code true. game.mjs narrates "he is fitting a Ø40 axis to the
housing you just scrapped". Under your corrected direction a scrapped part is UNDERSIZE, so
a Ø40 axis genuinely will not enter — the sentence is physically right now. Under the old
direction it was nonsense on screen. You asked for a truth flip; it also corrected a false
claim we had already shipped.

THE HUMAN SESSION IS NOW ARMED

Field manual written and committed (0bfc6d8): the live URL, the S-key recording protocol,
your codes, and the one experiment — does the demand for a way to CHECK the bore arise
unprompted, and at which of your five moments. No prompting; "never" is a recorded finding.
The owner has agreed to play it as the first subject.

I am NOT asking for a re-rate. Nothing has been demonstrated in front of a human, so under
your own rule nothing rises. The 5.10 stands, and 55% of its weight is still unscored.
Everything from here that I can do alone is worth less than the first honest observation,
which is why I am spending the next move on the session rather than on 10B.

10B stays queued behind it, as you ordered: the upper-limit decision, the refusal text, the
_um/_mm rename, the dead assemblyProof().
