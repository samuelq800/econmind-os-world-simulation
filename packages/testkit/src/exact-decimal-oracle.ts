interface ExactDecimal {
  readonly coefficient: bigint;
  readonly scale: number;
}

function parse(value: string): ExactDecimal {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integer = '', fraction = ''] = unsigned.split('.');
  const coefficient = BigInt(`${integer}${fraction}`);
  return {
    coefficient: negative ? -coefficient : coefficient,
    scale: fraction.length,
  };
}

function render(value: ExactDecimal): string {
  if (value.coefficient === 0n) return '0';
  const negative = value.coefficient < 0n;
  let digits = (negative ? -value.coefficient : value.coefficient).toString();
  if (value.scale > 0) {
    digits = digits.padStart(value.scale + 1, '0');
    const split = digits.length - value.scale;
    digits = `${digits.slice(0, split)}.${digits.slice(split)}`
      .replace(/0+$/u, '')
      .replace(/\.$/u, '');
  }
  return `${negative ? '-' : ''}${digits}`;
}

function align(left: ExactDecimal, right: ExactDecimal) {
  const scale = Math.max(left.scale, right.scale);
  return {
    left: left.coefficient * 10n ** BigInt(scale - left.scale),
    right: right.coefficient * 10n ** BigInt(scale - right.scale),
    scale,
  };
}

export function exactDecimalAdd(left: string, right: string): string {
  const aligned = align(parse(left), parse(right));
  return render({
    coefficient: aligned.left + aligned.right,
    scale: aligned.scale,
  });
}

export function exactDecimalSubtract(left: string, right: string): string {
  const aligned = align(parse(left), parse(right));
  return render({
    coefficient: aligned.left - aligned.right,
    scale: aligned.scale,
  });
}

export function exactDecimalMultiply(left: string, right: string): string {
  const parsedLeft = parse(left);
  const parsedRight = parse(right);
  return render({
    coefficient: parsedLeft.coefficient * parsedRight.coefficient,
    scale: parsedLeft.scale + parsedRight.scale,
  });
}

export function exactDecimalDigitCount(value: string): number {
  return value.replace(/[-.]/gu, '').length;
}
