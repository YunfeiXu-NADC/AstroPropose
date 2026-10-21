import ProposalWorkspace from '@/components/ProposalWorkspace';

export default async function PersonalProposalsPage({ searchParams }) {
  const { type } = await searchParams;
  const personalType = type === 'research' || type === 'opportunity' ? type : 'all';
  return <ProposalWorkspace view="all" personalType={personalType} />;
}
