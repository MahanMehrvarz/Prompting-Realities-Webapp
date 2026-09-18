// Artifacts built with Prompting Realities, grouped into the three series that
// appear on the home page grid.
//
// TODO (consent pending): Kenwyn Hoefnagel's and Tianrui Pan's written consent
// to use their names, images and video on the public site is not yet confirmed.
// Do not deploy the student series publicly until it is.
//
// Media lives in frontend/public/projects/, derived from the `home page/` folder:
// stills resized to 1600px JPEG, videos re-encoded to 720p H.264 (167MB -> 42MB).
// The originals are untouched in `home page/media/`.

export type ProjectMedia =
  /** Self-hosted mp4 in public/projects, with a poster so nothing preloads. */
  | { kind: "video"; src: string; poster: string }
  /** Vimeo-hosted, embedded by player URL. */
  | { kind: "vimeo"; src: string }
  | { kind: "image"; src: string };

export type Project = {
  id: string;
  title: string;
  maker: string;
  description: string;
  tag: string;
  media: ProjectMedia | null;
};

export type ProjectSeries = {
  label: string;
  blurb?: string;
  /** The thesis the series comes out of, in the public TU Delft repository. */
  thesis?: { title: string; author: string; url: string };
  projects: Project[];
};

export const projectSeries: ProjectSeries[] = [
  {
    label: "Reference prototypes — Mahan Mehrvarz",
    projects: [
      {
        id: "A01",
        title: "Windmill Diorama",
        maker: "Mahan Mehrvarz",
        description:
          "Three motorized windmills on a topographic model, driven from a Telegram chatbot. Conversational commands become motor speeds and directions, sent as JSON over MQTT. This is the reference implementation — the one documented in the GitHub repo.",
        tag: "the baseline pipeline",
        media: {
          kind: "vimeo",
          src: "https://player.vimeo.com/video/1020471640?h=0&title=0&byline=0&portrait=0",
        },
      },
    ],
  },
  {
    label: "Pan-tilt robots — Kenwyn Hoefnagel, TU Delft IDE, 2025",
    blurb:
      "Three prototypes on identical Pimoroni Pan-Tilt HAT hardware. Same two servos every time; everything that differs is in the description and the schema.",
    thesis: {
      title: "Animistic interactions in conversation with LLM-powered robots",
      author: "K. Hoefnagel, MSc Industrial Design Engineering, TU Delft, 2025",
      url: "https://repository.tudelft.nl/record/uuid:76152afb-5716-4f58-bb99-58bf1a5895ad",
    },
    projects: [
      {
        id: "A05",
        title: "The Curious Observer",
        maker: "Kenwyn Hoefnagel",
        description:
          "Adds a PiCamera with OpenCV object detection. The servos track what they see in a tight Python loop while the model narrates what it thinks the thing is doing.",
        tag: "vision input",
        media: { kind: "video", src: "/projects/vid2.mp4", poster: "/projects/poster2.jpg" },
      },
      {
        id: "A06",
        title: "The Reluctant Dancer",
        maker: "Kenwyn Hoefnagel",
        description:
          "Extends the schema with dance_pattern arrays, making the model a choreographer: give it a genre or a mood and it composes the movement.",
        tag: "composed movement",
        media: { kind: "video", src: "/projects/vid3.mp4", poster: "/projects/poster3.jpg" },
      },
      {
        id: "A07",
        title: "The Conscious Traveller",
        maker: "Kenwyn Hoefnagel",
        description:
          "Accepts photos over Telegram and uses a vision model to recognise itself in them, then composes a response from enumerated libraries of movement styles, patterns and combinations.",
        tag: "self-recognition",
        media: { kind: "video", src: "/projects/vid4.mp4", poster: "/projects/poster4.jpg" },
      },
    ],
  },
  {
    label: "Tangible storytelling — Tianrui Pan, TU Delft IDE, 2025",
    blurb:
      "Two narrative prototypes that push on what counts as output.",
    thesis: {
      title: "Prototyping AI-enabled tangible storytelling",
      author: "T. Pan, MSc Design for Interaction, TU Delft, 2025",
      url: "https://repository.tudelft.nl/record/uuid:08f136c2-f4e1-4a21-a528-5dd220bb9bac",
    },
    projects: [
      {
        id: "A09",
        title: "The Story of 3 Cubes",
        maker: "Tianrui Pan",
        description:
          "Three coloured cubes enact a noir narrative. You move two of them; the system moves the red one on a repurposed 3D-printer pulley, driven by what image recognition makes of the scene you just built.",
        tag: "system-moved props",
        media: { kind: "image", src: "/projects/a09.jpg" },
      },
      {
        id: "A11",
        title: "Interactive Story Table",
        maker: "Tianrui Pan",
        description:
          "The consolidated system: a wooden table with an embedded monitor, ArUco-marked game pieces, an overhead webcam and voice in/out. Two AI threads — a Story AI and a Supervisor AI — run in parallel, tracking four separate memory registers.",
        tag: "multi-agent",
        media: { kind: "video", src: "/projects/vid5.mp4", poster: "/projects/poster5.jpg" },
      },
    ],
  },
];
