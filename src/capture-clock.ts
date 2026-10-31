type Part = number;
type DateArguments =
  | []
  | [value: number | string | Date]
  | [year: Part, monthIndex: Part]
  | [year: Part, monthIndex: Part, date: Part]
  | [year: Part, monthIndex: Part, date: Part, hours: Part]
  | [year: Part, monthIndex: Part, date: Part, hours: Part, minutes: Part]
  | [
      year: Part,
      monthIndex: Part,
      date: Part,
      hours: Part,
      minutes: Part,
      seconds: Part,
    ]
  | [
      year: Part,
      monthIndex: Part,
      date: Part,
      hours: Part,
      minutes: Part,
      seconds: Part,
      milliseconds: Part,
    ];

/**
 * Makes `new Date()`, `Date()` and `Date.now()` answer `stated` (an ISO 8601 instant) for the rest of the process, and
 * does nothing when it is unset or empty. Explicit dates and the static helpers keep their behaviour. The clock does
 * not advance: two runs that stamp the same events write the same stamps. Load it with `node --require`, so every
 * module of the backend, and every child process that inherits `NODE_OPTIONS`, sees it.
 */
export function fixProcessClock(stated: string | undefined): void {
  if (stated === undefined || stated === "") return;
  const instant = Date.parse(stated);
  if (Number.isNaN(instant))
    throw new Error(`HELIO_NOW must be an ISO 8601 instant, got "${stated}"`);

  const RealDate = Date;
  RealDate.now = () => instant;
  globalThis.Date = new Proxy(RealDate, {
    construct(_target, args: DateArguments): Date {
      switch (args.length) {
        case 0:
          return new RealDate(instant);
        case 1:
          return new RealDate(args[0]);
        case 2:
          return new RealDate(args[0], args[1]);
        case 3:
          return new RealDate(args[0], args[1], args[2]);
        case 4:
          return new RealDate(args[0], args[1], args[2], args[3]);
        case 5:
          return new RealDate(args[0], args[1], args[2], args[3], args[4]);
        case 6:
          return new RealDate(
            args[0],
            args[1],
            args[2],
            args[3],
            args[4],
            args[5],
          );
        case 7:
          return new RealDate(
            args[0],
            args[1],
            args[2],
            args[3],
            args[4],
            args[5],
            args[6],
          );
      }
    },
    apply: () => new RealDate(instant).toString(),
  });
}

fixProcessClock(process.env.HELIO_NOW);
