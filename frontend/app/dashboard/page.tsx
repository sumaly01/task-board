// Server component — no 'use client'. Runs on the server during the request.
// Can read cookies directly and make authenticated fetch calls to the gateway.
// The middleware already verified the token before this page runs, so we
// can assume the user is authenticated here.
import Link from 'next/link';
import { fetchProjects } from '@/lib/api';
import { CreateProjectForm } from '@/components/CreateProjectForm';
import { LogoutButton } from '@/components/LogoutButton';
import { cookies } from 'next/headers';

export default async function DashboardPage() {
  // cookies() reads from the current request — works in server components only.
  // The middleware has already validated the token, so if this runs, we're authed.
  const userId = cookies().get('userId')?.value ?? '';
  const projects = await fetchProjects();

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">TaskFlow</h1>
        <LogoutButton />
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Your projects</h2>
            <p className="text-sm text-gray-500 mt-1">User ID: {userId}</p>
          </div>
          <CreateProjectForm />
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg font-medium">No projects yet</p>
            <p className="text-sm mt-1">Create your first project to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
                <p className="text-xs text-gray-400 mt-2">
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
