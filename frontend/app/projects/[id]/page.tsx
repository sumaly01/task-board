// Day 5: project detail page with task list
// Day 6: Kanban board with @hello-pangea/dnd drag-and-drop

interface ProjectPageProps {
  params: { id: string };
}

export default function ProjectPage({ params }: ProjectPageProps) {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Project {params.id}</h1>
      <p>Kanban board coming Day 6</p>
    </main>
  );
}
