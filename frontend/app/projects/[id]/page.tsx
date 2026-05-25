// Server component — fetches project + tasks using the httpOnly cookie,
// then passes initial data and userId to the client component.
// The client component handles Socket.io (requires browser APIs).
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { fetchProject, fetchTasks } from '@/lib/api';
import { ProjectTaskList } from '@/components/ProjectTaskList';

interface PageProps {
  params: { id: string };
}

const PRIORITY_COLORS = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-red-100 text-red-700',
};

const STATUS_LABELS = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};

export default async function ProjectPage({ params }: PageProps) {
  const [project, tasks] = await Promise.all([
    fetchProject(params.id),
    fetchTasks(params.id),
  ]);

  if (!project) notFound();

  // userId is needed by the Socket.io client to register with the notification service.
  // We read it from the non-httpOnly cookie set at login — this works server-side too.
  const userId = cookies().get('userId')?.value ?? '';

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <nav className="text-sm text-gray-500 mb-1">
          <Link href="/dashboard" className="hover:text-blue-600">Dashboard</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">{project.name}</span>
        </nav>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">{project.name}</h2>

        {/* ProjectTaskList is a client component — it handles socket.io and toast.
            We pass all data down as props from this server component. */}
        <ProjectTaskList
          projectId={project.id}
          userId={userId}
          initialTasks={tasks}
          priorityColors={PRIORITY_COLORS}
          statusLabels={STATUS_LABELS}
        />
      </div>
    </main>
  );
}
