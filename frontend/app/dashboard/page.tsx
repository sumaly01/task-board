// Server component — runs on the server, can read httpOnly cookies and fetch data.
// The middleware has already verified the token before this page runs.
import Link from 'next/link';
import { fetchProjects, fetchMembers } from '@/lib/api';
import { CreateProjectForm } from '@/components/CreateProjectForm';
import { LogoutButton } from '@/components/LogoutButton';
import { cookies } from 'next/headers';

export default async function DashboardPage() {
  const cookieStore = cookies();
  const userId = cookieStore.get('userId')?.value ?? '';
  // Role is stored in a readable cookie set at login (not httpOnly — not a secret).
  // ADMIN sees all projects + a members panel + "Create Project" button.
  // MEMBER sees only their assigned projects and no creation controls.
  const role = cookieStore.get('role')?.value ?? 'MEMBER';
  const isAdmin = role === 'ADMIN';

  // Fetch in parallel — projects are always fetched; members only for ADMIN.
  // The gateway enforces the ADMIN role on GET /members, so fetchMembers()
  // returns [] automatically for MEMBERs (403 is swallowed as an empty array).
  const [projects, members] = await Promise.all([
    fetchProjects(),
    isAdmin ? fetchMembers() : Promise.resolve([]),
  ]);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">TaskFlow</h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isAdmin
              ? 'bg-purple-100 text-purple-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {role}
          </span>
        </div>
        <LogoutButton />
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {isAdmin ? 'All projects' : 'Your projects'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">User ID: {userId}</p>
          </div>
          {/* Only ADMIN can create projects — MEMBER button is hidden entirely.
              The gateway enforces this at the API level too (POST /projects → 403 for MEMBER). */}
          {isAdmin && <CreateProjectForm />}
        </div>

        <div className={`gap-8 ${isAdmin ? 'grid grid-cols-1 lg:grid-cols-3' : ''}`}>
          {/* ── Projects grid ── */}
          <div className={isAdmin ? 'lg:col-span-2' : ''}>
            {projects.length === 0 ? (
              <div className="text-center py-20 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
                <p className="text-lg font-medium text-gray-500">
                  {isAdmin ? 'No projects yet' : 'No assigned projects yet'}
                </p>
                <p className="text-sm mt-1">
                  {isAdmin
                    ? 'Create your first project to get started'
                    : 'You will appear here once a task is assigned to you'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          {/* ── Members panel — ADMIN only ── */}
          {isAdmin && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 h-fit">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                Team members ({members.length})
              </h3>
              {members.length === 0 ? (
                <p className="text-xs text-gray-400">No members yet</p>
              ) : (
                <ul className="space-y-3">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                        <p className="text-xs text-gray-400 truncate">{m.email}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
