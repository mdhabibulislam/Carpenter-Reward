import { Link } from 'react-router-dom';
import { RefreshCcw, Upload } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useDisb } from '../disb/store';
import { ReadyAgain } from '../components/ReadyAgain';
import { Button, Card, EmptyState, PageHeader } from '../components/ui';

/** Super Admin: returned payments that can be sent again because the carpenter has a new bKash number. */
export default function AdminReady() {
  const { user } = useAuth();
  const data = useDisb((s) => s.data);
  
  return (
    <>
      <PageHeader demo={false} eyebrow="Super Admin" title="Ready to disburse again"
        subtitle="Returned payments where the carpenter now has a new, valid bKash number in the latest carpenter list." />
      {!data ? (
        <Card>
          <EmptyState icon={RefreshCcw} title={!data ? 'Upload the disbursement data first' : 'Upload a new carpenter list'}
            text={!data ? 'Returned payments come from the disbursement workbook.' : 'The list with new bKash numbers is matched against returned payments.'} />
          <div className="pb-8 text-center">
            <Link to={!data ? '/admin/upload' : '/admin/carpenters'}><Button variant="primary" icon={Upload}>{!data ? 'Upload data' : 'Upload carpenter list'}</Button></Link>
          </div>
        </Card>
      ) : (
        <div className="-mt-6"><ReadyAgain user={user!} rows={data.rows} scopeLabel="All territories" /></div>
      )}
    </>
  );
}
