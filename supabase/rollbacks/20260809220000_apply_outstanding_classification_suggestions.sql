update public.transactions target
set canonical_category_id = snapshot.canonical_category_id,
    context_id = snapshot.context_id,
    bucket_id = snapshot.bucket_id,
    tax_treatment = snapshot.tax_treatment,
    transfer_reason = snapshot.transfer_reason,
    classification_reviewed_at = snapshot.classification_reviewed_at,
    updated_at = snapshot.updated_at
from backup_20260809_direct_suggestions.transactions snapshot
where target.id = snapshot.id;

drop schema backup_20260809_direct_suggestions cascade;
