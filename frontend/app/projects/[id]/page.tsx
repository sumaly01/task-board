// Server component — fetches project + tasks using the httpOnly cookie,
// then passes initial data and userId to the KanbanBoard client component.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import dynamic from 'next/dynamic';
import { fetchProject, fetchTasks } from '@/lib/api';

// ssr: false prevents Next.js from server-rendering the Kanban board.
// @hello-pangea/dnd generates DOM attributes (drag handles, ARIA roles, inline styles)
// that differ between server and client, causing React hydration mismatches.
// With ssr: false the server sends nothing for this component — the browser renders
// it fresh with no HTML to reconcile against.
const KanbanBoard = dynamic(
  () => import('@/components/KanbanBoard'),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['To Do', 'In Progress', 'Done'].map((label) => (
          <div key={label} className="bg-gray-100 rounded-2xl p-4">
            <div className="h-4 w-20 bg-gray-200 rounded animate-pulse mb-3" />
            <div className="min-h-[100px]" />
          </div>
        ))}
      </div>
    ),
  }
);

interface PageProps {
  params: { id: string };
}

export default async function ProjectPage({ params }: PageProps) {
  // Fetch project metadata and its tasks in parallel — no reason to wait
  // for one before starting the other.
  const [project, tasks] = await Promise.all([
    fetchProject(params.id),
    fetchTasks(params.id),
  ]);

  if (!project) notFound();

  // userId is needed by the Socket.io client to register with the notification service.
  // We read it from the non-httpOnly cookie set at login.
  const userId = cookies().get('userId')?.value ?? '';

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <nav className="text-sm text-gray-500">
          <Link href="/dashboard" className="hover:text-blue-600 transition-colors">
            Dashboard
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">{project.name}</span>
        </nav>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">{project.name}</h2>

        {/* KanbanBoard is a client component — it handles drag-and-drop,
            socket.io, and the create task modal. We pass all server-fetched
            data down as props so the initial render is not blocked by client JS. */}
        <KanbanBoard
          projectId={project.id}
          userId={userId}
          initialTasks={tasks}
        />
      </div>
    </main>
  );
}
