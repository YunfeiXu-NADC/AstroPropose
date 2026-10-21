import { redirect } from 'next/navigation';

export default function OpportunityProposalPage() {
  redirect('/dashboard/proposals?type=opportunity');
}

