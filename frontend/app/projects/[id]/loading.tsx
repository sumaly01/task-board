// Shown while the project page server component is fetching project + tasks.
export default function ProjectLoading() {
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="h-8 w-52 bg-gray-200 rounded animate-pulse mb-8" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['To Do', 'In Progress', 'Done'].map((label) => (
            <div key={label} className="bg-gray-100 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-6 bg-gray-200 rounded-full animate-pulse" />
              </div>
              {[1, 2].map((i) => (
                <div key={i} className="bg-white rounded-xl px-4 py-3 mb-2">
                  <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mb-2" />
                  <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
