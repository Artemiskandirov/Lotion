export type LottieBezier = {
  c: boolean;
  v: [number, number][];
  i: [number, number][];
  o: [number, number][];
};

type Cmd = { op: string; args: number[] };

const tokenRe = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;

function tokenize(d: string): Cmd[] {
  const out: Cmd[] = [];
  let current: Cmd | null = null;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(d)) !== null) {
    if (match[1]) {
      if (current) out.push(current);
      current = { op: match[1], args: [] };
    } else if (current) {
      current.args.push(Number(match[2]));
    }
  }
  if (current) out.push(current);
  return out;
}

function add(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] + b[0], a[1] + b[1]];
}

function sub(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] - b[0], a[1] - b[1]];
}

function mul(a: [number, number], scalar: number): [number, number] {
  return [a[0] * scalar, a[1] * scalar];
}

export function svgPathToLottieShape(d: string): LottieBezier {
  const cmds = tokenize(d);
  const vertices: [number, number][] = [];
  const inTangents: [number, number][] = [];
  const outTangents: [number, number][] = [];

  let cursor: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  let prevCtrl: [number, number] | null = null;
  let closed = false;
  let lastCmd: string | null = null;

  for (const { op, args } of cmds) {
    const isRel = op === op.toLowerCase();
    const upper = op.toUpperCase();
    let i = 0;

    while (i < args.length || upper === "Z") {
      if (upper === "M") {
        const x = args[i++];
        const y = args[i++];
        const p: [number, number] = isRel ? add(cursor, [x, y]) : [x, y];
        cursor = p;
        start = p;
        vertices.push(p);
        inTangents.push([0, 0]);
        outTangents.push([0, 0]);
        prevCtrl = null;
        if (i >= args.length) break;
      } else if (upper === "L") {
        const x = args[i++];
        const y = args[i++];
        const p: [number, number] = isRel ? add(cursor, [x, y]) : [x, y];
        vertices.push(p);
        inTangents.push([0, 0]);
        outTangents.push([0, 0]);
        cursor = p;
        prevCtrl = null;
      } else if (upper === "H") {
        const x = args[i++];
        const p: [number, number] = isRel ? [cursor[0] + x, cursor[1]] : [x, cursor[1]];
        vertices.push(p);
        inTangents.push([0, 0]);
        outTangents.push([0, 0]);
        cursor = p;
        prevCtrl = null;
      } else if (upper === "V") {
        const y = args[i++];
        const p: [number, number] = isRel ? [cursor[0], cursor[1] + y] : [cursor[0], y];
        vertices.push(p);
        inTangents.push([0, 0]);
        outTangents.push([0, 0]);
        cursor = p;
        prevCtrl = null;
      } else if (upper === "C") {
        const c1: [number, number] = isRel ? add(cursor, [args[i++], args[i++]]) : [args[i++], args[i++]];
        const c2: [number, number] = isRel ? add(cursor, [args[i++], args[i++]]) : [args[i++], args[i++]];
        const p: [number, number] = isRel ? add(cursor, [args[i++], args[i++]]) : [args[i++], args[i++]];
        outTangents[outTangents.length - 1] = sub(c1, cursor);
        vertices.push(p);
        inTangents.push(sub(c2, p));
        outTangents.push([0, 0]);
        cursor = p;
        prevCtrl = c2;
      } else if (upper === "S") {
        const reflected: [number, number] = prevCtrl ? sub(mul(cursor, 2), prevCtrl) : cursor;
        const c2: [number, number] = isRel ? add(cursor, [args[i++], args[i++]]) : [args[i++], args[i++]];
        const p: [number, number] = isRel ? add(cursor, [args[i++], args[i++]]) : [args[i++], args[i++]];
        outTangents[outTangents.length - 1] = sub(reflected, cursor);
        vertices.push(p);
        inTangents.push(sub(c2, p));
        outTangents.push([0, 0]);
        cursor = p;
        prevCtrl = c2;
      } else if (upper === "Q") {
        const cq: [number, number] = isRel ? add(cursor, [args[i++], args[i++]]) : [args[i++], args[i++]];
        const p: [number, number] = isRel ? add(cursor, [args[i++], args[i++]]) : [args[i++], args[i++]];
        const c1 = add(cursor, mul(sub(cq, cursor), 2 / 3));
        const c2 = add(p, mul(sub(cq, p), 2 / 3));
        outTangents[outTangents.length - 1] = sub(c1, cursor);
        vertices.push(p);
        inTangents.push(sub(c2, p));
        outTangents.push([0, 0]);
        cursor = p;
        prevCtrl = cq;
      } else if (upper === "T") {
        const reflected: [number, number] = prevCtrl ? sub(mul(cursor, 2), prevCtrl) : cursor;
        const p: [number, number] = isRel ? add(cursor, [args[i++], args[i++]]) : [args[i++], args[i++]];
        const c1 = add(cursor, mul(sub(reflected, cursor), 2 / 3));
        const c2 = add(p, mul(sub(reflected, p), 2 / 3));
        outTangents[outTangents.length - 1] = sub(c1, cursor);
        vertices.push(p);
        inTangents.push(sub(c2, p));
        outTangents.push([0, 0]);
        cursor = p;
        prevCtrl = reflected;
      } else if (upper === "Z") {
        closed = true;
        cursor = start;
        prevCtrl = null;
        break;
      } else {
        i = args.length;
      }
    }

    lastCmd = upper;
  }

  void lastCmd;
  return { c: closed, v: vertices, i: inTangents, o: outTangents };
}
