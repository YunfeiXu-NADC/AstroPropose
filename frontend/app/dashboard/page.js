'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getProposals,
  getCurrentUser,
  listInstruments,
  submitInstrumentFeedbackAPI,
} from '@/lib/api';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [instrumentOptions, setInstrumentOptions] = useState([]);
  const [selectedInstrument, setSelectedInstrument] = useState('');
  const [instrumentQueue, setInstrumentQueue] = useState([]);
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const router = useRouter();

  const isScheduler = useMemo(
    () => user?.roles?.includes('Instrument Scheduler'),
    [user]
  );
  const isAdmin = useMemo(() => user?.roles?.includes('Admin'), [user]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      router.push('/login');
      return;
    }

    const fetchData = async () => {
      try {
        const userData = await getCurrentUser();
        setUser(userData);
        const proposalsData = await getProposals();
        setProposals(proposalsData);

        if (userData.roles.includes('Instrument Scheduler') || userData.roles.includes('Admin')) {
          const instruments = await listInstruments();
          setInstrumentOptions(instruments);
          if (instruments.length > 0) {
            setSelectedInstrument((prev) => prev || instruments[0].code);
          }
        }
      } catch (err) {
        console.error(err);
        setError('Failed to fetch data. You may need to log in again.');
        if (err.status === 401) {
            localStorage.removeItem('token');
            router.push('/login');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  useEffect(() => {
    const loadInstrumentQueue = async () => {
      if (!selectedInstrument || (!isScheduler && !isAdmin)) {
        setInstrumentQueue([]);
        return;
      }
      try {
        const data = await getProposals({ instrument_code: selectedInstrument });
        setInstrumentQueue(data);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch instrument scheduling queue');
      }
    };
    loadInstrumentQueue();
  }, [selectedInstrument, isScheduler, isAdmin]);

  const handleFeedbackChange = (proposalId, field, value) => {
    setFeedbackDrafts((prev) => ({
      ...prev,
      [proposalId]: {
        ...(prev[proposalId] || { status: 'under_assessment', payload: {} }),
        [field]: value,
      },
    }));
  };

  const handleFeedbackPayloadChange = (proposalId, key, value) => {
    setFeedbackDrafts((prev) => {
      const draft = prev[proposalId] || { status: 'under_assessment', payload: {} };
      return {
        ...prev,
        [proposalId]: {
          ...draft,
          payload: {
            ...draft.payload,
            [key]: value,
          },
        },
      };
    });
  };

  const submitFeedback = async (proposalId) => {
    if (!selectedInstrument) {
      return;
    }
    const draft = feedbackDrafts[proposalId];
    if (!draft) {
      setFeedbackMessage('Please fill in the feedback information');
      return;
    }

    try {
      await submitInstrumentFeedbackAPI(proposalId, selectedInstrument, {
        status: draft.status || 'under_assessment',
        comment: draft.comment,
        payload: draft.payload,
      });
      setFeedbackMessage('Feedback submitted');
      const data = await getProposals({ instrument_code: selectedInstrument });
      setInstrumentQueue(data);
    } catch (err) {
      console.error(err);
      setFeedbackMessage(err.info?.message || 'Failed to submit feedback');
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Welcome, {user ? user.username : 'User'}</h1>
        <p className="text-sm text-gray-600">Roles: {user?.roles?.join(', ')}</p>
      </header>

      {error && <p className="text-red-500 bg-red-100 p-3 rounded mb-4">{error}</p>}

      <section className="bg-white shadow-md rounded p-6 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Account</h2>
            <p className="text-sm text-gray-600">{user?.email}</p>
          </div>
          <Link
            href="/change-password"
            className="inline-flex items-center justify-center bg-gray-900 hover:bg-black text-white font-medium py-2 px-4 rounded"
          >
            Change Password
          </Link>
        </div>
      </section>

      <section className="bg-white shadow-md rounded p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">My Proposals</h2>
          <Link
            href="/proposals/new"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded"
          >
            Create Phase 1 Proposal
            </Link>
        </div>

        {proposals.length ? (
          <ul className="divide-y divide-gray-200">
            {proposals.map((proposal) => (
              <li key={proposal.id} className="py-3">
                <p className="font-semibold">
                  {proposal.title}
                  <span className="ml-2 text-xs font-mono bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                    {proposal.status}
                  </span>
                </p>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                  <div>
                    <h4 className="font-medium">Phase Progress</h4>
                    <ul className="list-disc list-inside">
                      {proposal.phases.map((phase) => (
                        <li key={`${proposal.id}-${phase.phase}`}>
                          {phase.phase}: {phase.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium">Instruments</h4>
                    <ul className="list-disc list-inside">
                      {proposal.instruments.map((inst) => (
                        <li key={`${proposal.id}-${inst.instrument}`}>
                          {inst.instrument}: {inst.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No proposals created yet.</p>
        )}
      </section>

      {(isScheduler || isAdmin) && (
        <section className="bg-white shadow-md rounded p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Instrument Scheduling Workbench</h2>
            <select
              value={selectedInstrument}
              onChange={(evt) => setSelectedInstrument(evt.target.value)}
              className="border border-gray-300 rounded px-3 py-2"
            >
              {instrumentOptions.map((instrument) => (
                <option key={instrument.code} value={instrument.code}>
                  {instrument.code} — {instrument.name}
                </option>
              ))}
            </select>
          </div>

          {!instrumentQueue.length && <p className="text-sm text-gray-500">No proposals pending scheduling.</p>}
          {instrumentQueue.length > 0 && (
            <div className="space-y-6">
              {instrumentQueue.map((proposal) => {
                const draft = feedbackDrafts[proposal.id] || { status: 'under_assessment', payload: {} };
                return (
                  <div key={`queue-${proposal.id}`} className="border rounded-lg p-4">
                    <header className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{proposal.title}</p>
                        <p className="text-xs text-gray-500">Status: {proposal.status}</p>
                      </div>
                      <span className="text-xs font-mono bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                        Phase: {proposal.assignment?.status || 'Not started'}
                      </span>
                    </header>
                    <div className="mt-3 text-sm text-gray-700">
                      <p className="font-medium">Form data submitted by proposer:</p>
                      <pre className="bg-gray-100 rounded p-3 overflow-x-auto text-xs mt-2">
                        {JSON.stringify(proposal.assignment?.form_data || {}, null, 2)}
                      </pre>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Scheduling Status</label>
                        <select
                          value={draft.status}
                          onChange={(evt) => handleFeedbackChange(proposal.id, 'status', evt.target.value)}
                          className="mt-1 border border-gray-300 rounded px-3 py-2"
                        >
                          <option value="under_assessment">Under Assessment</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="needs_revision">Needs Revision</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Visibility Window</label>
                        <input
                          type="text"
                          value={draft.payload?.visibility_window || ''}
                          onChange={(evt) => handleFeedbackPayloadChange(proposal.id, 'visibility_window', evt.target.value)}
                          className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
                          placeholder="e.g., 2025-05-01 ~ 2025-05-07"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Resource Notes</label>
                        <textarea
                          rows={3}
                          value={draft.payload?.resource_notes || ''}
                          onChange={(evt) => handleFeedbackPayloadChange(proposal.id, 'resource_notes', evt.target.value)}
                          className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Assessment Comments</label>
                        <textarea
                          rows={3}
                          value={draft.comment || ''}
                          onChange={(evt) => handleFeedbackChange(proposal.id, 'comment', evt.target.value)}
                          className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => submitFeedback(proposal.id)}
                          className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded"
                        >
                          Submit Scheduling Result
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
      </div>
          )}
          {feedbackMessage && <p className="text-sm text-gray-600">{feedbackMessage}</p>}
        </section>
      )}
    </div>
  );
}
