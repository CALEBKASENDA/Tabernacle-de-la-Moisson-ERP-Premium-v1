export type DeletionPolicy = {
  allowHardDelete: boolean; // should be false for finance (corbeille obligatoire)
  requireReason: boolean;
};

export function validateDeletionRequest(params: {
  policy: DeletionPolicy;
  reason?: string;
}): void {
  const { policy, reason } = params;
  if (policy.allowHardDelete) {
    // Domain does not enforce hard delete flow; still validate reason if required.
    if (policy.requireReason && (!reason || reason.trim().length === 0)) {
      throw new Error('Deletion reason is required');
    }
    return;
  }

  if (!policy.requireReason) return;
  if (!reason || reason.trim().length === 0) {
    throw new Error('Deletion reason is required for logical deletion');
  }
}

