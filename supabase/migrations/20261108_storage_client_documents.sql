-- Ensure client-documents bucket exists and configure RLS policies for document scanning & storage

INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Allow client-documents upload" ON storage.objects
FOR INSERT TO authenticated, anon
WITH CHECK (bucket_id = 'client-documents');

CREATE POLICY "Allow client-documents select" ON storage.objects
FOR SELECT TO authenticated, anon
USING (bucket_id = 'client-documents');

CREATE POLICY "Allow client-documents update" ON storage.objects
FOR UPDATE TO authenticated, anon
USING (bucket_id = 'client-documents')
WITH CHECK (bucket_id = 'client-documents');

CREATE POLICY "Allow client-documents delete" ON storage.objects
FOR DELETE TO authenticated, anon
USING (bucket_id = 'client-documents');
