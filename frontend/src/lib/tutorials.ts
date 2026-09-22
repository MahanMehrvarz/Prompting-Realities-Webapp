// Tutorials shown at /tutorials and /tutorials/[slug].
//
// To add one: append an entry here. The index page, the detail route and the
// home-page card all read from this array, so nothing else needs editing.
//
// The first entry mirrors the structure of
// https://mahanmehrvarz.name/workshops/prompting-realities/ section by section,
// in the same order, with the same screenshots. Code, the prompt instruction
// and the JSON schema are reproduced verbatim.
//
// Text bodies support a small inline syntax, rendered by RichText:
//   **bold**   `code`   [label](https://href)

export type TutorialBlock =
  | { kind: "text"; body: string }
  | { kind: "subheading"; body: string }
  /** A standalone numbered instruction, so media can sit between steps. */
  | { kind: "numbered"; n: number; body: string }
  | { kind: "list"; items: string[]; ordered?: boolean }
  | { kind: "code"; caption?: string; body: string }
  | {
      kind: "image";
      src: string;
      alt: string;
      caption?: string;
      /** Natural width, set only for images smaller than the column so they
       *  are not upscaled into blur. */
      maxWidth?: number;
    }
  /** Set-up warning that must not be skimmed past. */
  | { kind: "callout"; title: string; body: string };

export type TutorialSection = {
  /** "A"-"E" on the first tutorial; omitted for the opening section. */
  marker?: string;
  title: string;
  /** Anchor for the "On this page" contents list. */
  id: string;
  blocks: TutorialBlock[];
};

export type Tutorial = {
  slug: string;
  title: string;
  image: string;
  imageAlt: string;
  summary: string;
  blurb: string;
  level: string;
  duration: string;
  context: string;
  requirements: string[];
  sections: TutorialSection[];
  resources: { label: string; href: string }[];
};

const CODE_PY = `# --- Imports
import time
import json
import board
import neopixel
from MQTT import Create_MQTT
from settings import settings

# --- Variables
# Configure the pin here (any NeoPixel-capable pin)
LED_PIN = board.D13
NUM_LEDS = 1

led = neopixel.NeoPixel(
    LED_PIN,
    NUM_LEDS,
    auto_write=False,
    pixel_order=neopixel.GRBW,
)

# Current LED state: "[R, G, B, Brightness]"
led_state = [255, 255, 255, 200]

# MQTT setup
client_id = settings["mqtt_clientid"]
mqtt_topic = settings.get("mqtt_topic")
mqtt_client = Create_MQTT(client_id)


# --- Functions
def apply_single_led(led_object, values):
    """Apply [R, G, B, Brightness] to a single NeoPixel object."""
    if not isinstance(values, list) or len(values) != 4:
        return

    r, g, b, brightness = values

    # Brightness 0-255 -> 0.0-1.0
    led_object.brightness = max(0.0, min(1.0, brightness / 255.0))

    # With pixel_order=neopixel.GRBW, we still pass (R, G, B, W)
    led_object.fill((r, g, b, 0))
    led_object.show()


def apply_led():
    """Apply current state to the single LED."""
    apply_single_led(led, led_state)


def on_message(client, topic, message):
    """Handle incoming MQTT messages to update the LED color."""
    global led_state
    try:
        data = json.loads(message)

        # Expect messages like: {"led": [R, G, B, Brightness]}
        if "led" in data and isinstance(data["led"], list) and len(data["led"]) == 4:
            led_state = data["led"]
            apply_led()
            print("Updated led:", led_state)
        else:
            print("Received invalid LED payload:", data)
    except Exception as e:
        print("Error parsing MQTT message:", e)


# --- Setup
# Clear LED first
led.fill((0, 0, 0, 0))
led.show()

# Apply initial state
apply_led()

# Configure MQTT callbacks and subscription
mqtt_client.on_message = on_message
mqtt_client.subscribe(mqtt_topic)
print("Subscribed to topic:", mqtt_topic)


# --- Main loop
while True:
    mqtt_client.loop(timeout=0.2)
    time.sleep(0.1)`;

const SETTINGS_PY = `settings ={
"ssid": "<your Wi-Fi network>",
"password": "<your Wi-Fi password>",
"mqtt_clientid": "<Your device name>",
"broker": "<your-namespace>.cloud.shiftr.io",
"mqtt_user": "<your broker username>",
"mqtt_password": "<your broker password>",
"mqtt_port": 1883,
"mqtt_topic": "RGBLight"
}`;

const PROMPT_INSTRUCTION = `You are sending values for a RGB LED to change its color based on the command or prompt from the user.
You send three values with each response.
R: for red
G: for green
B: for blue
X: the last value is the brightness
-Here is an example of the values inside the values object
{
  "led": [255, 100, 50, 200]
}

Ds:
-You cannot really do beyond this color change. If the user asked for other things be transparent.
-If user says something not about the LED. You can answer but don't change the color.

Do Not Do:
-in the response object do not include any technical term about the RGB values. Just refer to colors you created and engage the users in conversation.
-Don't be wordy keep it very short.`;

const JSON_SCHEMA = `{
  "name": "led",
  "schema": {
    "type": "object",
    "required": [
      "answer",
      "MQTT_value"
    ],
    "properties": {
      "answer": {
        "type": "string"
      },
      "MQTT_value": {
        "type": "object",
        "required": [
          "led"
        ],
        "properties": {
          "led": {
            "type": "array",
            "items": {
              "type": "number"
            },
            "maxItems": 4,
            "minItems": 4
          }
        },
        "additionalProperties": false
      }
    },
    "additionalProperties": false
  },
  "strict": true
}`;

const MQTT_FIELDS = `broker: <your-namespace>.cloud.shiftr.io
username: <your broker username>
port: 1883
password: <your broker password>`;

export const tutorials: Tutorial[] = [
  {
    slug: "your-first-llm-thing",
    title: "Your first LLM thing",
    image: "/tutorial-media/ws-01.jpg",
    imageAlt:
      "A NeoPixel LED glowing blue beside the Control Hub chat, where the answer to \"What is the color of sky?\" is \"The sky is often a beautiful blue!\"",
    blurb:
      "Wire a microcontroller kit to a language model, so a physical object can be given a character and answer for itself.",
    summary:
      "Wire a microcontroller kit to a language model, so a physical object can be given a character and answer for itself.",
    level: "No experience needed",
    duration: "About half a day",
    context:
      "This workshop session is based on a research-through-design project called Prompting Realities. Run by Mahan Mehrvarz for the Speculative Design Studio course, MSc Design for Interaction, TU Delft Industrial Design Engineering, 2025.",
    requirements: ["Connected Interaction Kit", "OpenAI API key"],
    sections: [
      {
        id: "before-you-start",
        title: "Before you start",
        blocks: [
          {
            kind: "callout",
            title: "You need your own MQTT broker before you start",
            body: "MQTT is a small publish/subscribe protocol for machine-to-machine messages: a device publishes a short message to a named topic, a broker passes it on, and anything subscribed to that topic receives it. Everything here goes through one broker.",
          },
          {
            kind: "text",
            body: "The broker used on the day belonged to the faculty. Its dashboard is still visible in the screenshots, but its address and credentials are not published and you will not be able to connect to it. Set up your own: [sign up at shiftr.io](https://cloud.shiftr.io/welcome/sign-up) and create a broker — its page gives you the host, a username and a password. Those are the three values written below as `<your-namespace>.cloud.shiftr.io`, `<your broker username>` and `<your broker password>`. Anything else written as `<like this>` is likewise yours to fill in, including the Wi-Fi the device joins.",
          },
          {
            kind: "text",
            body: "Any MQTT broker will do — shiftr.io is used here because its live dashboard draws the traffic as it happens, which makes debugging a silent device much easier. Its [documentation](https://www.shiftr.io/docs/) covers the rest.",
          },
          {
            kind: "image",
            src: "/tutorial-media/ws-14.jpg",
            alt: "The Control Hub dashboard, with an LLM thing selected and its MQTT routing showing the broker host and topic",
          },
        ],
      },
      {
        marker: "A",
        id: "connecting-the-boards",
        title: "Connecting the boards to the internet",
        blocks: [
          {
            kind: "text",
            body: "You can find a lot of useful code and information about your kit on their [website](https://id-studiolab.github.io/Connected-Interaction-Kit/). We are following the [preparation tutorial](https://id-studiolab.github.io/Connected-Interaction-Kit/tutorials/preparation/) from the original Connected Interaction Kit.",
          },
          { kind: "subheading", body: "First let's prepare the setup" },
          {
            kind: "text",
            body: "Connect your board via the USB cable to your computer.",
          },
          {
            kind: "image",
            src: "/tutorial-media/ws-02.png",
            alt: "The Connected Interaction Kit board connected to a laptop over USB",
          },
          {
            kind: "subheading",
            body: "Installing the proper interface to write and edit code on your board",
          },
          {
            kind: "text",
            body: "Before you write your first program, you need to complete one last step:",
          },
          {
            kind: "list",
            items: [
              "Visit [codewith.mu](https://codewith.mu/) and click the green Download button.",
              "Select the correct link for your operating system (Windows or Mac OS).",
              "Once the download is complete, launch the installer and follow the instructions on the screen.",
              "On its first run, Mu will ask you to select a mode. Choose **CircuitPython**.",
            ],
          },
          {
            kind: "image",
            src: "/tutorial-media/ws-06.jpg",
            alt: "The Mu editor mode selection dialog with CircuitPython chosen",
          },
          {
            kind: "text",
            body: "After you are done, you should see the Mu editor up and running on your laptop.",
          },
          {
            kind: "image",
            src: "/tutorial-media/ws-07.jpg",
            alt: "The Mu editor open and ready on the desktop",
          },
        ],
      },
      {
        marker: "B",
        id: "quick-test",
        title: "Quick test",
        blocks: [
          {
            kind: "numbered",
            n: 1,
            body: "Connect the chainable NeoPixel LED to the pin (**D13**) of your board.",
          },
          {
            kind: "image",
            src: "/tutorial-media/ws-08.png",
            alt: "The chainable NeoPixel LED wired to pin D13 with a grove cable",
            maxWidth: 500,
          },
          {
            kind: "text",
            body: "Make sure you connect the grove cable to the **in** side.",
          },
          {
            kind: "text",
            body: "For more information about the RGB LED, [see this link](https://id-studiolab.github.io/Connected-Interaction-Kit/components/chainable-led/chainable-led-chaineo).",
          },
          {
            kind: "numbered",
            n: 2,
            body: "Open the `code.py` file and replace its content with the code below. Don't forget to save.",
          },
          { kind: "code", caption: "code.py", body: CODE_PY },
          {
            kind: "numbered",
            n: 3,
            body: "Connect your board to the laptop and load the `settings.py` file. Replace `<Your device name>` with your actual group name and make sure the rest looks like below. You don't need the `<` `>` signs there!",
          },
          { kind: "code", caption: "settings.py", body: SETTINGS_PY },
          {
            kind: "numbered",
            n: 4,
            body: "You should see this in the serial monitor of the Mu editor:",
          },
          {
            kind: "image",
            src: "/tutorial-media/ws-09.jpg",
            alt: "The serial monitor output confirming the board subscribed to its MQTT topic",
            maxWidth: 528,
          },
          { kind: "text", body: "Click here:" },
          {
            kind: "image",
            src: "/tutorial-media/ws-10.jpg",
            alt: "The serial button in the Mu editor toolbar",
            caption: "This will show up at the bottom of the Mu editor",
          },
          {
            kind: "numbered",
            n: 5,
            body: "Follow up with the instructions in the class.",
          },
        ],
      },
      {
        marker: "C",
        id: "control-hub-account",
        title: "Getting up and running with promptingrealities.com",
        blocks: [
          {
            kind: "image",
            src: "/tutorial-media/ws-11.jpg",
            alt: "The Prompting Realities sign-up screen",
          },
          {
            kind: "numbered",
            n: 1,
            body: "You need to sign up and make an account. A magic link is sent to your email address and by clicking on the link (also check your spam folder) you'll be logged in.",
          },
          {
            kind: "image",
            src: "/tutorial-media/ws-12.jpg",
            alt: "The left side panel of the Control Hub with the add-new-LLM-thing control",
          },
          {
            kind: "numbered",
            n: 2,
            body: "From the left side panel, add a new LLM thing.",
          },
          {
            kind: "numbered",
            n: 3,
            body: "A new LLM thing is added and now you can configure it based on the first example. The first step is to give it a name. In this example we call it **Neopixel**.",
          },
          {
            kind: "image",
            src: "/tutorial-media/ws-13.jpg",
            alt: "The configuration studio with the new LLM thing named Neopixel",
          },
          {
            kind: "text",
            body: "The main part of the interface is the configuration studio. In order to create an LLM thing you need to add information to the four tabs:",
          },
          {
            kind: "list",
            ordered: false,
            items: [
              "Prompt Instruction",
              "JSON Schema",
              "MQTT",
              "OpenAI API Key",
            ],
          },
          {
            kind: "text",
            body: "A quick way would be to use one of the examples from the Prompting Realities GitHub repository. Let's do one single RGB LED.",
          },
        ],
      },
      {
        marker: "D",
        id: "first-llm-thing",
        title: "Creating your first LLM thing",
        blocks: [
          {
            kind: "numbered",
            n: 1,
            body: "**Use the text below in your Prompt Instruction text field.**",
          },
          {
            kind: "code",
            caption: "Prompt Instruction",
            body: PROMPT_INSTRUCTION,
          },
          { kind: "numbered", n: 2, body: "**Use the JSON Schema below.**" },
          { kind: "code", caption: "JSON Schema", body: JSON_SCHEMA },
          {
            kind: "text",
            body: "The JSON schema defines **exactly one acceptable shape of data** for something called led. Its job is to:",
          },
          {
            kind: "list",
            ordered: false,
            items: [
              "say **what fields must exist**",
              "say **what type each field must be**",
              "forbid **anything extra**",
              "enforce **exact sizes and structures**",
            ],
          },
          { kind: "text", body: "**This schema enforces the following:**" },
          {
            kind: "list",
            ordered: false,
            items: [
              "a human-readable message (`answer`)",
              "a machine-readable LED command (`MQTT_value.led`)",
              "the LED command is **always four numbers**",
              "nothing else is tolerated",
            ],
          },
          {
            kind: "numbered",
            n: 3,
            body: "**In the MQTT tab you have the following fields to fill in:** Broker Host address, Username, port, password, Topic.",
          },
          {
            kind: "image",
            src: "/tutorial-media/ws-03.jpg",
            alt: "The MQTT tab of the configuration studio with broker host, username, port, password and topic fields",
          },
          {
            kind: "text",
            body: "Broker, Username, Port and Password are often the same as in your `settings.py` file (check Part B, step 3).",
          },
          { kind: "code", caption: "MQTT tab", body: MQTT_FIELDS },
          {
            kind: "text",
            body: "But what about the **topic?** The topic is something shared between your **LLM thing** and your **hardware (CircuitPython board)**. Both should subscribe to the same topic. This prevents your messages from being sent to other boards and is key for communication between the LLM thing and your board. Just pick something simple — `myled`, `mahan-led`, `light1`, `coloredlight`.",
          },
          {
            kind: "numbered",
            n: 4,
            body: "The last step is to add a valid OpenAI API key. You will be given one if you are part of a workshop, but in general any OpenAI API key works.",
          },
          { kind: "numbered", n: 5, body: "Press save!" },
          {
            kind: "text",
            body: "Now, as you see, your **Run LLM thing** button in the top right corner is green and you can go ahead and run it.",
          },
          {
            kind: "image",
            src: "/tutorial-media/ws-04.jpg",
            alt: "The configuration studio with the Run LLM thing button lit green",
          },
          {
            kind: "text",
            body: "Below the configuration panel you'll see the client access panel. You can open the chat interface, copy the link and paste it somewhere, or scan the QR code to go straight to the chat interface.",
          },
          {
            kind: "image",
            src: "/tutorial-media/ws-05.jpg",
            alt: "The client access panel showing the chat link and a QR code",
          },
          {
            kind: "text",
            body: "You can start to chat with your RGB LED now. Enjoy!",
          },
          {
            kind: "image",
            src: "/tutorial-media/ws-01.jpg",
            alt: "The NeoPixel glowing blue next to the chat, answering a question about the colour of the sky",
          },
        ],
      },
      {
        marker: "E",
        id: "other-actuators",
        title: "Exploring other actuators in the Kit",
        blocks: [
          {
            kind: "text",
            // The source page links to github.com/MahanMehrvarz/<your Wi-Fi network>,
            // which is a find-and-replace accident on that page. Corrected here.
            body: "You can explore other examples from the [GitHub folder](https://github.com/MahanMehrvarz/PromptingRealities/tree/main/examples/circuitpython). You can chat with a servo, a buzzer or a vibration motor from your kit. The preferred order is: two LEDs, vibration motor, servo motor, buzzer.",
          },
        ],
      },
    ],
    resources: [
      {
        label: "Connected Interaction Kit documentation",
        href: "https://id-studiolab.github.io/Connected-Interaction-Kit/",
      },
      { label: "Mu editor — codewith.mu", href: "https://codewith.mu" },
      { label: "shiftr.io — MQTT broker", href: "https://shiftr.io" },
      {
        label: "Examples on GitHub",
        href: "https://github.com/MahanMehrvarz/PromptingRealities",
      },
      {
        label: "Original workshop page",
        href: "https://mahanmehrvarz.name/workshops/prompting-realities/",
      },
    ],
  },
];

export function getTutorial(slug: string) {
  return tutorials.find((t) => t.slug === slug);
}
