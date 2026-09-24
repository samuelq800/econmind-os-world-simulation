# V00.2 public-launcher SIGINT test normalization — scoped P2 acceptance

`OWNER_FAST_TRACK_ACCEPTED` applies only to the test assertion for the
public `pnpm dev:*` launchers. On macOS with the pinned pnpm runtime, all
three launcher SIGINT cases consistently reported `{code:130, signal:null}`
instead of `{code:null, signal:'SIGINT'}`. Exit 130 is the conventional
128 + SIGINT representation; no application lifecycle code was changed.

The assertion now accepts those two SIGINT exit representations. SIGTERM
remains exact, and every case still requires captured descendants to stop,
the listener to close and rebind, and `SHUTDOWN_COMPLETE` output. The focused
V00.2 file passed 20/20 locally after the change, with targeted ESLint and
Prettier passing. The prior local full check failed 3/1192 tests solely on
the old exit-shape assertion; it is not relabeled as a passing full check.
An official candidate-wide run on a fixed main SHA is separate evidence.
