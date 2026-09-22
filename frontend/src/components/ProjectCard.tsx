import type { Project } from "@/lib/projects";
import { VideoPlayer } from "@/components/VideoPlayer";

/**
 * Cards without media fall back to a typographic tile rather than an empty box,
 * so the grid still reads as designed while footage is still being collected.
 */
function TypographicTile({ title, tag }: { title: string; tag: string }) {
  return (
    <div className="flex h-full w-full flex-col justify-between bg-[var(--ink-dark)] p-5">
      <span className="text-2xl font-black leading-tight text-[var(--accent-green)]">
        {title}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--card-fill)]/70">
        {tag}
      </span>
    </div>
  );
}

export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white shadow-[5px_5px_0_var(--shadow-deep)] transition hover:-translate-y-1 hover:shadow-[7px_7px_0_var(--shadow-deep)]">
      <div
        className="relative w-full border-b-[3px] border-[var(--card-shell)]"
        style={{ paddingBottom: "56.25%" }}
      >
        <div className="absolute inset-0">
          {project.media?.kind === "video" ? (
            <VideoPlayer
              src={project.media.src}
              poster={project.media.poster}
              title={project.title}
            />
          ) : project.media?.kind === "vimeo" ? (
            <iframe
              src={project.media.src}
              className="h-full w-full"
              frameBorder="0"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              title={project.title}
            />
          ) : project.media?.kind === "image" ? (
            <img
              src={project.media.src}
              alt={project.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <TypographicTile title={project.title} tag={project.tag} />
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5 lg:p-6">
        <h3 className="text-xl font-black leading-tight text-[var(--ink-dark)]">
          {project.title}
        </h3>
        <p className="text-xs font-semibold text-[var(--ink-muted)]">{project.maker}</p>
        <p className="flex-1 text-sm leading-relaxed text-[var(--foreground)]">
          {project.description}
        </p>

        <div className="mt-3 border-t-2 border-[var(--card-shell)]/20 pt-3">
          <span className="pill-chip">{project.tag}</span>
        </div>
      </div>
    </article>
  );
}
