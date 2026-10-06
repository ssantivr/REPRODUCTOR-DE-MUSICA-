/**
 * Step-by-step scripts of the doubly linked list operations.
 *
 * Each function replays one operation of DoublyLinkedList on a small copy and
 * records a frame after every pointer assignment, in the same order the class
 * makes them, so the interface can show which `prev` / `next` changes at each
 * step. The list is linear here (no circular links) to keep the ends visible.
 */

export interface PointerNode {
  id: string;
  label: string;
  prev: string | null;
  next: string | null;
}

export interface PointerFrame {
  /** Nodes in the order they are drawn, left to right */
  nodes: PointerNode[];
  head: string | null;
  tail: string | null;
  /** Node drawn out of the row: just created, or already unlinked */
  lifted: string | null;
  /** Node this step is looking at */
  focus: string | null;
  /** Pointers changed by this step: "id:next", "id:prev", "head" or "tail" */
  changed: string[];
  /** What happened, in Spanish (it is shown in the interface) */
  note: string;
}

const NEW_ID = "new";
const name = (node: PointerNode | undefined) => `«${node?.label ?? "?"}»`;
const hops = (count: number) => `${count} ${count === 1 ? "salto" : "saltos"}`;

class Tape {
  readonly frames: PointerFrame[] = [];
  nodes: PointerNode[];
  head: string | null;
  tail: string | null;
  lifted: string | null = null;

  constructor(labels: string[]) {
    this.nodes = labels.map((label, i) => ({
      id: `n${i}`,
      label,
      prev: i > 0 ? `n${i - 1}` : null,
      next: i < labels.length - 1 ? `n${i + 1}` : null,
    }));
    this.head = this.nodes[0]?.id ?? null;
    this.tail = this.nodes[this.nodes.length - 1]?.id ?? null;
  }

  get(id: string | null): PointerNode | undefined {
    return this.nodes.find((node) => node.id === id);
  }

  shot(note: string, changed: string[] = [], focus: string | null = null): void {
    this.frames.push({
      nodes: this.nodes.map((node) => ({ ...node })),
      head: this.head,
      tail: this.tail,
      lifted: this.lifted,
      focus,
      changed,
      note,
    });
  }

  /** Same choice as traverseToIndex: from the head for the first half, from the tail for the second. */
  reach(index: number): string {
    const node = this.nodes[index];
    const count = this.nodes.length;
    if (index === 0) return `${name(node)} es el inicio: se llega sin recorrer nada.`;
    if (index === count - 1) return `${name(node)} es el final: se llega sin recorrer nada.`;
    return index < count / 2
      ? `Se llega a ${name(node)} desde el inicio, siguiendo «siguiente»: ${hops(index)}.`
      : `Se llega a ${name(node)} desde el final, siguiendo «anterior»: ${hops(count - 1 - index)}.`;
  }
}

const OPENING = "Así está la lista: cada estrella apunta a la siguiente (cian, arriba) y a la anterior (magenta, abajo).";

/** insertAt(index, label): prepend, append or four pointers in the middle. */
export function insertSteps(labels: string[], index: number, label: string): PointerFrame[] {
  const tape = new Tape(labels);
  const count = tape.nodes.length;
  const at = Math.max(0, Math.min(index, count));
  tape.shot(OPENING);

  const leader = tape.nodes[at - 1];
  const follower = tape.nodes[at];
  const fresh: PointerNode = { id: NEW_ID, label, prev: null, next: null };
  tape.nodes.splice(at, 0, fresh);
  tape.lifted = NEW_ID;
  tape.shot(`Se crea la estrella ${name(fresh)}. Todavía no apunta a nadie y nadie apunta a ella.`, [], NEW_ID);

  if (count === 0) {
    tape.head = NEW_ID;
    tape.tail = NEW_ID;
    tape.lifted = null;
    tape.shot("La lista estaba vacía: el inicio y el final apuntan a la nueva estrella.", ["head", "tail"], NEW_ID);
  } else if (!leader && follower) {
    fresh.next = follower.id;
    tape.shot(`Su «siguiente» apunta al inicio actual, ${name(follower)}.`, [`${NEW_ID}:next`], NEW_ID);
    follower.prev = NEW_ID;
    tape.shot(`El «anterior» de ${name(follower)} apunta a la nueva estrella.`, [`${follower.id}:prev`], follower.id);
    tape.head = NEW_ID;
    tape.lifted = null;
    tape.shot(`El inicio de la lista pasa a ser ${name(fresh)}. Cambiaron tres punteros y no hubo que recorrer nada.`, ["head"], NEW_ID);
  } else if (leader && !follower) {
    fresh.prev = leader.id;
    tape.shot(`Su «anterior» apunta al final actual, ${name(leader)}.`, [`${NEW_ID}:prev`], NEW_ID);
    leader.next = NEW_ID;
    tape.shot(`El «siguiente» de ${name(leader)} apunta a la nueva estrella.`, [`${leader.id}:next`], leader.id);
    tape.tail = NEW_ID;
    tape.lifted = null;
    tape.shot(`El final de la lista pasa a ser ${name(fresh)}. Cambiaron tres punteros y no hubo que recorrer nada.`, ["tail"], NEW_ID);
  } else if (leader && follower) {
    // The walk is counted on the list as it was before the new node appeared
    const walk = new Tape(labels).reach(at - 1);
    tape.shot(`${walk} Irá justo después de ella.`, [], leader.id);
    fresh.prev = leader.id;
    tape.shot(`El «anterior» de la nueva apunta a ${name(leader)}.`, [`${NEW_ID}:prev`], NEW_ID);
    fresh.next = follower.id;
    tape.shot(`El «siguiente» de la nueva apunta a ${name(follower)}.`, [`${NEW_ID}:next`], NEW_ID);
    leader.next = NEW_ID;
    tape.shot(`${name(leader)} deja de apuntar a ${name(follower)}: su «siguiente» es ahora la nueva.`, [`${leader.id}:next`], leader.id);
    follower.prev = NEW_ID;
    tape.lifted = null;
    tape.shot(`El «anterior» de ${name(follower)} apunta a la nueva. Listo: cambiaron cuatro punteros y ninguna otra estrella se tocó.`, [`${follower.id}:prev`], follower.id);
  }
  return tape.frames;
}

/** removeAt(index): the two neighbors point to each other and the node lets go. */
export function removeSteps(labels: string[], index: number): PointerFrame[] {
  const tape = new Tape(labels);
  tape.shot(OPENING);
  const target = tape.nodes[index];
  if (!target) return tape.frames;

  tape.shot(tape.reach(index), [], target.id);
  unlink(tape, target);

  target.prev = null;
  target.next = null;
  tape.lifted = target.id;
  tape.shot(`${name(target)} suelta sus dos punteros: ya nadie llega a ella y sale de la lista.`, [`${target.id}:prev`, `${target.id}:next`], target.id);

  tape.nodes = tape.nodes.filter((node) => node !== target);
  tape.lifted = null;
  const left = tape.nodes.length;
  tape.shot(`Quedan ${left} ${left === 1 ? "estrella" : "estrellas"}. Solo cambiaron los punteros de sus vecinas.`);
  return tape.frames;
}

/** move(from, to): unlink the node, find who now sits at `to`, link it back before that one. */
export function moveSteps(labels: string[], from: number, to: number): PointerFrame[] {
  const tape = new Tape(labels);
  tape.shot(OPENING);
  const node = tape.nodes[from];
  if (!node || to < 0 || to >= tape.nodes.length || from === to) return tape.frames;

  tape.shot(tape.reach(from), [], node.id);
  unlink(tape, node);

  const rest = tape.nodes.filter((other) => other !== node);
  const follower = rest[to];
  rest.splice(to, 0, node);
  tape.nodes = rest;
  tape.lifted = node.id;
  tape.shot(
    follower
      ? `${name(node)} quedó suelta. En la posición ${to + 1} está ahora ${name(follower)}: irá justo antes de ella.`
      : `${name(node)} quedó suelta. La posición ${to + 1} es el final: irá después de la última.`,
    [],
    follower?.id ?? node.id,
  );

  if (!follower) {
    const last = tape.get(tape.tail);
    node.prev = tape.tail;
    node.next = null;
    tape.shot(`Su «anterior» apunta al final actual, ${name(last)}, y su «siguiente» queda vacío.`, [`${node.id}:prev`, `${node.id}:next`], node.id);
    if (last) {
      last.next = node.id;
      tape.shot(`El «siguiente» de ${name(last)} apunta a ${name(node)}.`, [`${last.id}:next`], last.id);
    }
    tape.tail = node.id;
    tape.lifted = null;
    tape.shot(`El final pasa a ser ${name(node)}. No se creó ni se destruyó ninguna estrella: solo cambiaron punteros.`, ["tail"], node.id);
    return tape.frames;
  }

  const leader = tape.get(follower.prev);
  node.prev = follower.prev;
  node.next = follower.id;
  tape.shot(
    `Su «anterior» apunta a ${leader ? name(leader) : "nadie (será el inicio)"} y su «siguiente» a ${name(follower)}.`,
    [`${node.id}:prev`, `${node.id}:next`],
    node.id,
  );
  if (leader) {
    leader.next = node.id;
    tape.shot(`El «siguiente» de ${name(leader)} apunta a ${name(node)}.`, [`${leader.id}:next`], leader.id);
  } else {
    tape.head = node.id;
    tape.shot(`El inicio pasa a ser ${name(node)}.`, ["head"], node.id);
  }
  follower.prev = node.id;
  tape.lifted = null;
  tape.shot(`El «anterior» de ${name(follower)} apunta a ${name(node)}. No se creó ni se destruyó ninguna estrella: solo cambiaron punteros.`, [`${follower.id}:prev`], follower.id);
  return tape.frames;
}

/** First half of removeNode and of move: the neighbors of `target` now point to each other. */
function unlink(tape: Tape, target: PointerNode): void {
  const before = tape.get(target.prev);
  const after = tape.get(target.next);

  if (before) {
    before.next = target.next;
    tape.shot(
      after
        ? `${name(before)} salta sobre ${name(target)}: su «siguiente» apunta a ${name(after)}.`
        : `${name(before)} ya no tiene siguiente: su puntero queda vacío.`,
      [`${before.id}:next`],
      before.id,
    );
  } else {
    tape.head = target.next;
    tape.shot(after ? `El inicio de la lista pasa a ser ${name(after)}.` : "La lista se queda sin inicio.", ["head"], after?.id ?? null);
  }

  if (after) {
    after.prev = target.prev;
    tape.shot(
      before
        ? `${name(after)} salta sobre ${name(target)}: su «anterior» apunta a ${name(before)}.`
        : `${name(after)} ya no tiene anterior: su puntero queda vacío.`,
      [`${after.id}:prev`],
      after.id,
    );
  } else {
    tape.tail = target.prev;
    tape.shot(before ? `El final de la lista pasa a ser ${name(before)}.` : "La lista se queda sin final.", ["tail"], before?.id ?? null);
  }
  tape.lifted = target.id;
}
