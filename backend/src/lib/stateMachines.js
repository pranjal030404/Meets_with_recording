/**
 * Single source of truth for every status field's legal transitions.
 * A machine is { initial, transitions: { from: [to, ...] } }. Terminal states have an empty list.
 * Use `can` for soft checks and `assertTransition` (throws StateTransitionError, HTTP 409) for hard ones.
 */

export class StateTransitionError extends Error {
  constructor(machine, from, to) {
    super(`${machine}: cannot go from '${from}' to '${to}'`);
    this.name = 'StateTransitionError';
    this.statusCode = 409;
    this.machine = machine;
    this.from = from;
    this.to = to;
  }
}

const define = (name, initial, transitions) => {
  const states = Object.keys(transitions);
  return Object.freeze({
    name,
    initial,
    states,
    transitions,
    isState: (s) => states.includes(s),
    isTerminal: (s) => (transitions[s] || []).length === 0,
    /** Same-state is always a no-op, never an error. */
    can: (from, to) => from === to || (transitions[from] || []).includes(to),
    assertTransition(from, to) {
      if (from !== to && !(transitions[from] || []).includes(to)) throw new StateTransitionError(name, from, to);
    }
  });
};

export const meetingMachine = define('meeting', 'scheduled', {
  scheduled: ['active', 'ended', 'cancelled'],
  active: ['ended', 'cancelled'],
  ended: [],
  cancelled: []
});

// An invitee can change their mind until the meeting is over.
export const inviteeMachine = define('invitee', 'pending', {
  pending: ['accepted', 'declined'],
  accepted: ['declined'],
  declined: ['accepted']
});

// Polls are created 'active', or 'draft' (private to managers) and then started via PUT /polls/:id/start.
export const pollMachine = define('poll', 'active', {
  draft: ['active', 'ended'],
  active: ['ended'],
  ended: []
});

export const breakoutMachine = define('breakout', 'open', {
  open: ['closed'],
  closed: []
});

export const taskMachine = define('task', 'todo', {
  todo: ['in_progress', 'done'],
  in_progress: ['todo', 'done'],
  done: ['todo', 'in_progress'] // reopening is allowed
});

// 'trialing' and 'past_due' are reserved for a real payment provider (trial periods, failed renewals).
// Today's demo gateway never produces them; they are kept legal here so wiring one in needs no model change.
export const subscriptionMachine = define('subscription', 'active', {
  trialing: ['active', 'canceled', 'expired'],
  active: ['past_due', 'canceled', 'expired'],
  past_due: ['active', 'canceled', 'expired'],
  canceled: ['active'], // resubscribe
  expired: ['active']
});

export const paymentMachine = define('payment', 'pending', {
  pending: ['paid', 'failed'],
  paid: ['refunded'],
  failed: ['pending'], // retry
  refunded: []
});

export const transcriptionMachine = define('transcription', 'queued', {
  queued: ['processing', 'failed'],
  processing: ['completed', 'failed'],
  completed: ['queued', 'processing'], // re-run (retry shows 'queued' first)
  failed: ['queued', 'processing'] // retry
});
