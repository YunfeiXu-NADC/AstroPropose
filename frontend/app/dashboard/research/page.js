import { redirect } from 'next/navigation';

export default function ResearchProposalPage() {
  redirect('/dashboard/proposals?type=research');
}

