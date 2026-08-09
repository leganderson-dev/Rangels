update public.transactions target
set transfer_reason = snapshot.transfer_reason,
    context_id = snapshot.context_id,
    canonical_category_id = snapshot.canonical_category_id,
    bucket_id = snapshot.bucket_id,
    tax_treatment = snapshot.tax_treatment,
    classification_reviewed_at = snapshot.classification_reviewed_at,
    updated_at = snapshot.updated_at
from backup_20260809_final_classification.transfers snapshot
where target.id = snapshot.id;

drop schema backup_20260809_final_classification cascade;
