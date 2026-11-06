/** Thrown when an expert asks for the group view before their own first answer exists (blind-answer lock). */
export class GroupLockedError extends Error {
  constructor(message = 'The group view opens after you submit your own answer.') {
    super(message);
    this.name = 'GroupLockedError';
  }
}

/** Thrown when a submission breaks a rule (probability range, reason length, unknown token). */
export class ValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
