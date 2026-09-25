// SMB1 PseudoRandomBitReg: NMI rotates seven bytes right each frame. The
// feedback is bit 1 of the first two bytes.
export function stepRandomBits(reg: Uint8Array) {
  const mixed = (reg[0]! & 0x02) ^ (reg[1]! & 0x02);
  let carry = mixed === 0 ? 0 : 1;
  for (let i = 0; i < reg.length; i++) {
    const byte = reg[i] ?? 0;
    const next = byte & 1;
    reg[i] = ((byte >>> 1) | (carry << 7)) & 0xff;
    carry = next;
  }
}
