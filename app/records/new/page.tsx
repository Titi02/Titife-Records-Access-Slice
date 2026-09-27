import Link from 'next/link';
import { RecordCreateForm } from '@/components/RecordCreateForm';

export default function RecordCreateFullPage() {
  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <Link href="/records" className="btn btn-ghost" style={{ marginBottom: '12px', paddingLeft: 0 }}>
            &larr; Back to Records
          </Link>
          <h1 className="page-title">Create Record</h1>
          <p className="page-subtitle">Add a new record to your scoped collection</p>
        </div>
      </div>

      <div className="record-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <RecordCreateForm />
      </div>
    </div>
  );
}
