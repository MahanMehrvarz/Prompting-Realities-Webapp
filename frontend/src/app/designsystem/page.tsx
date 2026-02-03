"use client";

import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Hash,
  Key,
  Lock,
  PauseCircle,
  PlayCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { ConfirmationModal } from "@/components/ConfirmationModal";

export default function DesignSystemPage() {
  const [showDangerModal, setShowDangerModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [textareaValue, setTextareaValue] = useState("");

  const colors = {
    "Core Colors": [
      { name: "--background", value: "#05c46b", desc: "Page background (green)" },
      { name: "--foreground", value: "#101010", desc: "Primary text color" },
      { name: "--card-shell", value: "#1b1b1b", desc: "Card borders, outlines" },
      { name: "--card-fill", value: "#f4ffe2", desc: "Card backgrounds (cream)" },
      { name: "--ink-dark", value: "#1d1d1d", desc: "Dark text, dark buttons" },
      { name: "--ink-muted", value: "#285438", desc: "Muted/secondary text" },
      { name: "--shadow-deep", value: "#0d5e3c", desc: "Drop shadow color" },
    ],
    "Accent Colors": [
      { name: "--accent-green", value: "#03c46b", desc: "Primary accent, success" },
      { name: "--accent-red", value: "#f45b4d", desc: "Danger, destructive actions" },
      { name: "accent-orange", value: "#ff8f1c", desc: "Warning states" },
      { name: "accent-blue", value: "#2563eb", desc: "Info, links" },
    ],
    "Status Badge Colors": [
      { name: "Running", value: "#00d692", textColor: "#013022", desc: "Active/running status" },
      { name: "Ready", value: "#ffe260", textColor: "#1a1300", desc: "Ready/complete status" },
      { name: "Draft", value: "#ff9d4d", textColor: "#2b1400", desc: "Draft/incomplete status" },
    ],
    "Feedback Colors": [
      { name: "Success bg", value: "#e6fff5", border: "#00d692", text: "#013022" },
      { name: "Error bg", value: "#ffe6e6", border: "#ff6b6b", text: "#4a0000" },
      { name: "Warning bg", value: "#fff0dc", border: "#ffb347", text: "#4a2100" },
      { name: "Info bg", value: "#e5f5ff", border: "#4a9eff", text: "#0a3d6b" },
    ],
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Header */}
      <header className="border-b-4 border-[var(--card-shell)] bg-[var(--card-fill)] px-6 py-6 shadow-[0_6px_0_var(--card-shell)]">
        <h1 className="text-4xl font-black text-[var(--ink-dark)] uppercase tracking-[0.1em]">
          Design System
        </h1>
        <p className="mt-2 text-[var(--ink-muted)]">
          Prompting Realities visual language and component library
        </p>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 space-y-16">
        {/* Colors Section */}
        <section>
          <h2 className="text-2xl font-bold text-[var(--card-fill)] mb-6 flex items-center gap-3">
            <span className="inline-block w-8 h-8 rounded-full bg-[var(--card-fill)] border-2 border-[var(--card-shell)]"></span>
            Colors
          </h2>

          {Object.entries(colors).map(([category, colorList]) => (
            <div key={category} className="mb-8">
              <h3 className="text-lg font-semibold text-[var(--card-fill)] mb-4">{category}</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {colorList.map((color, idx) => (
                  <div
                    key={idx}
                    className="card-panel p-4 flex items-center gap-4"
                  >
                    <div
                      className="w-14 h-14 rounded-[12px] border-2 border-[var(--card-shell)] flex-shrink-0"
                      style={{ backgroundColor: color.value }}
                    />
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold truncate">{color.name}</p>
                      <p className="font-mono text-xs text-[var(--ink-muted)]">{color.value}</p>
                      {"desc" in color && (
                        <p className="text-xs text-[var(--ink-muted)] mt-1">{color.desc}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Typography Section */}
        <section>
          <h2 className="text-2xl font-bold text-[var(--card-fill)] mb-6">Typography</h2>
          <div className="card-panel p-6 space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)] mb-2">Display / H1</p>
              <h1 className="text-5xl font-black text-[var(--ink-dark)] uppercase tracking-[0.1em]">
                Prompting Realities
              </h1>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)] mb-2">Heading / H2</p>
              <h2 className="text-2xl font-bold text-[var(--ink-dark)]">Section Title</h2>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)] mb-2">Subheading / H3</p>
              <h3 className="text-lg font-semibold text-[var(--ink-dark)]">Card Title</h3>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)] mb-2">Body Text</p>
              <p className="text-sm text-[var(--foreground)]">
                This is standard body text used for descriptions and content. It uses the default font size and foreground color.
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)] mb-2">Muted Text</p>
              <p className="text-sm text-[var(--ink-muted)]">
                This is muted text used for secondary information and helper text.
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)] mb-2">Label</p>
              <p className="text-xs uppercase tracking-[0.4em] text-[#0b321e]">MQTT ROUTING</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)] mb-2">Code / Mono</p>
              <code className="inline-block rounded-md bg-[var(--ink-dark)] px-3 py-1.5 text-sm text-[var(--card-fill)] font-mono">
                topic/default
              </code>
            </div>
          </div>
        </section>

        {/* Buttons Section */}
        <section>
          <h2 className="text-2xl font-bold text-[var(--card-fill)] mb-6">Buttons</h2>
          <div className="card-panel p-6 space-y-8">
            {/* Primary Buttons */}
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)] mb-4">Primary Actions</p>
              <div className="flex flex-wrap gap-4">
                <button className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--accent-green)] px-5 py-2 text-sm font-semibold text-[var(--ink-dark)] shadow-[5px_5px_0_var(--shadow-deep)] transition hover:-translate-y-1">
                  <PlayCircle className="h-4 w-4" />
                  Run LLM thing
                </button>
                <button className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-5 py-2 text-sm font-semibold text-white shadow-[5px_5px_0_var(--shadow-deep)] transition hover:-translate-y-1">
                  <Plus className="h-4 w-4" />
                  Add new
                </button>
                <button className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white shadow-[3px_3px_0_var(--shadow-deep)] transition hover:bg-[#1d4ed8]">
                  Got it
                </button>
              </div>
            </div>

            {/* Secondary Buttons */}
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)] mb-4">Secondary Actions</p>
              <div className="flex flex-wrap gap-4">
                <button className="rounded-full border-[3px] border-[var(--card-shell)] bg-white px-5 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--card-fill)]">
                  Cancel
                </button>
                <button className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--ink-dark)] hover:text-[var(--card-fill)]">
                  <Copy className="h-4 w-4" />
                  Copy
                </button>
              </div>
            </div>

            {/* Danger Buttons */}
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)] mb-4">Danger Actions</p>
              <div className="flex flex-wrap gap-4">
                <button className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--accent-red)] px-5 py-2 text-sm font-semibold text-[var(--card-fill)] shadow-[5px_5px_0_var(--shadow-deep)] transition hover:-translate-y-1">
                  <PauseCircle className="h-4 w-4" />
                  Stop run
                </button>
                <button className="rounded-full border-[3px] border-[var(--card-shell)] bg-[#c51c00] px-5 py-2 text-sm font-semibold text-white shadow-[3px_3px_0_var(--shadow-deep)] transition hover:bg-[#8b1400]">
                  Delete
                </button>
              </div>
            </div>

            {/* Icon Buttons */}
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)] mb-4">Icon Buttons</p>
              <div className="flex flex-wrap gap-4">
                <button className="rounded-full border border-[var(--card-shell)] bg-white/80 p-1.5 transition hover:bg-[var(--ink-dark)] hover:text-[var(--card-fill)]">
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button className="rounded-full border-2 border-[var(--card-shell)] bg-white p-1.5 text-[var(--ink-muted)] transition hover:bg-[var(--ink-dark)] hover:text-white">
                  <X className="h-4 w-4" />
                </button>
                <button className="rounded-full border-2 border-[var(--card-shell)] p-2 text-[var(--accent-red)] transition hover:bg-[var(--accent-red)] hover:text-white">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Disabled States */}
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)] mb-4">Disabled States</p>
              <div className="flex flex-wrap gap-4">
                <button
                  disabled
                  className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--accent-green)] px-5 py-2 text-sm font-semibold text-[var(--ink-dark)] shadow-[5px_5px_0_var(--shadow-deep)] disabled:cursor-not-allowed disabled:border-[rgba(27,27,27,0.4)] disabled:bg-[#9fb9aa] disabled:text-[#364b3e]"
                >
                  <PlayCircle className="h-4 w-4" />
                  Disabled
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Form Inputs Section */}
        <section>
          <h2 className="text-2xl font-bold text-[var(--card-fill)] mb-6">Form Inputs</h2>
          <div className="card-panel p-6 space-y-6">
            {/* Text Input */}
            <div>
              <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
                Text Input
              </label>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Enter text..."
                className="w-full rounded-[12px] border-2 border-[var(--card-shell)] bg-white px-4 py-2.5 text-sm placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-dark)]"
              />
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
                Password Input
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password..."
                  className="w-full rounded-[12px] border-2 border-[var(--card-shell)] bg-white px-4 py-2.5 pr-12 text-sm placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-dark)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink-dark)]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Textarea */}
            <div>
              <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
                Textarea
              </label>
              <textarea
                value={textareaValue}
                onChange={(e) => setTextareaValue(e.target.value)}
                placeholder="Enter longer text..."
                rows={4}
                className="w-full rounded-[12px] border-2 border-[var(--card-shell)] bg-white px-4 py-3 text-sm placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-dark)] resize-none"
              />
            </div>

            {/* Checkbox */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-[3px] border-[var(--card-shell)] text-[var(--ink-dark)] focus:ring-2 focus:ring-[var(--ink-dark)] focus:ring-offset-2 cursor-pointer"
                />
                <span className="text-sm text-[var(--foreground)] group-hover:text-[var(--ink-dark)]">
                  Checkbox option
                </span>
              </label>
            </div>
          </div>
        </section>

        {/* Cards Section */}
        <section>
          <h2 className="text-2xl font-bold text-[var(--card-fill)] mb-6">Cards & Panels</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Standard Card */}
            <div className="card-panel p-6">
              <h3 className="text-lg font-semibold text-[var(--ink-dark)] mb-2">Standard Card</h3>
              <p className="text-sm text-[var(--ink-muted)]">
                Uses .card-panel class with rounded corners, border, and shadow.
              </p>
              <code className="mt-3 inline-block text-xs font-mono text-[var(--ink-muted)]">
                .card-panel
              </code>
            </div>

            {/* Info Card */}
            <div className="rounded-[20px] border-[2px] border-[var(--card-shell)] bg-white px-4 py-3 shadow-[5px_5px_0_var(--card-shell)]">
              <p className="text-xs uppercase tracking-[0.4em] text-[#0b321e]">INFO CARD</p>
              <p className="mt-2 text-sm text-[var(--foreground)]">
                Smaller card with less padding, used for metadata display.
              </p>
            </div>

            {/* Assistant Card */}
            <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-4 shadow-[5px_5px_0_var(--card-shell)] transition hover:shadow-[8px_8px_0_var(--shadow-deep)]">
              <div className="rounded-[12px] bg-[var(--ink-dark)] px-4 py-3 text-[var(--card-fill)]">
                <h3 className="font-semibold">LLM Thing Card</h3>
                <p className="text-xs text-[var(--card-fill)]/70">Topic: led</p>
              </div>
              <div className="mt-3 flex gap-2">
                <span className="rounded-full border-2 border-[var(--card-shell)] bg-white px-3 py-1 text-xs">
                  4 msgs
                </span>
                <span className="rounded-full border-2 border-[var(--card-shell)] bg-white px-3 py-1 text-xs">
                  MQTT wired
                </span>
              </div>
            </div>

            {/* Selected Card */}
            <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-4 ring-4 ring-[var(--ink-dark)] shadow-[8px_8px_0_var(--shadow-deep)]">
              <div className="rounded-[12px] bg-[var(--ink-dark)] px-4 py-3 text-[var(--card-fill)]">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Selected Card</h3>
                  <span className="rounded-full bg-[#ffe260] px-2 py-0.5 text-xs font-semibold text-[#1a1300]">
                    READY
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Badges Section */}
        <section>
          <h2 className="text-2xl font-bold text-[var(--card-fill)] mb-6">Status Badges</h2>
          <div className="card-panel p-6">
            <div className="flex flex-wrap gap-4">
              <span className="rounded-full bg-[#00d692] px-3 py-1 text-sm font-semibold text-[#013022]">
                Running
              </span>
              <span className="rounded-full bg-[#ffe260] px-3 py-1 text-sm font-semibold text-[#1a1300]">
                Ready
              </span>
              <span className="rounded-full bg-[#ff9d4d] px-3 py-1 text-sm font-semibold text-[#2b1400]">
                Draft
              </span>
              <span className="rounded-full border-2 border-[var(--card-shell)] bg-white px-3 py-1 text-xs">
                Tag
              </span>
              <span className="flex items-center gap-1 rounded-full border-[2px] border-[#ffb347] bg-[#fff0dc] px-3 py-1 text-xs text-[#4a2100]">
                <AlertCircle className="h-3 w-3" />
                Warning badge
              </span>
            </div>
          </div>
        </section>

        {/* Alerts Section */}
        <section>
          <h2 className="text-2xl font-bold text-[var(--card-fill)] mb-6">Alerts & Feedback</h2>
          <div className="space-y-4">
            {/* Success Alert */}
            <div className="flex items-center gap-2 rounded-[20px] border-[3px] border-[#00d692] bg-[#e6fff5] px-4 py-3 text-sm text-[#013022]">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
              <span>Success! Your changes have been saved.</span>
            </div>

            {/* Error Alert */}
            <div className="flex items-center gap-2 rounded-[20px] border-[3px] border-[#ff6b6b] bg-[#ffe6e6] px-4 py-3 text-sm text-[#4a0000]">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>Error: Something went wrong. Please try again.</span>
            </div>

            {/* Warning Alert */}
            <div className="flex items-center gap-3 rounded-[20px] border-[3px] border-[#ffb347] bg-[#fff0dc] px-4 py-3 text-sm text-[#4a2100]">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <span>Warning: Please review before continuing.</span>
            </div>

            {/* Info Alert */}
            <div className="flex items-center gap-3 rounded-[20px] border-[3px] border-[#4a9eff] bg-[#e5f5ff] px-4 py-3 text-sm text-[#0a3d6b]">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>Info: Here is some helpful information.</span>
            </div>
          </div>
        </section>

        {/* Modals Section */}
        <section>
          <h2 className="text-2xl font-bold text-[var(--card-fill)] mb-6">Modals</h2>
          <div className="card-panel p-6">
            <p className="text-sm text-[var(--ink-muted)] mb-4">Click buttons to preview modal variants:</p>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => setShowDangerModal(true)}
                className="rounded-full border-[3px] border-[var(--card-shell)] bg-[#c51c00] px-5 py-2 text-sm font-semibold text-white shadow-[3px_3px_0_var(--shadow-deep)] transition hover:bg-[#8b1400]"
              >
                Danger Modal
              </button>
              <button
                onClick={() => setShowWarningModal(true)}
                className="rounded-full border-[3px] border-[var(--card-shell)] bg-[#ff8f1c] px-5 py-2 text-sm font-semibold text-white shadow-[3px_3px_0_var(--shadow-deep)] transition hover:bg-[#e67e0a]"
              >
                Warning Modal
              </button>
              <button
                onClick={() => setShowInfoModal(true)}
                className="rounded-full border-[3px] border-[var(--card-shell)] bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white shadow-[3px_3px_0_var(--shadow-deep)] transition hover:bg-[#1d4ed8]"
              >
                Info Modal
              </button>
            </div>

            {/* Info list items preview */}
            <div className="mt-8">
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)] mb-4">Modal List Items</p>
              <div className="space-y-3 max-w-md">
                <div className="flex items-start gap-3 rounded-[16px] border-[2px] border-[var(--card-shell)] bg-[var(--card-fill)] p-3">
                  <Key className="h-5 w-5 text-[#ff8f1c] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink-dark)]">API Key Required</p>
                    <p className="text-xs text-[var(--ink-muted)]">
                      The API key was not copied. You&apos;ll need to enter it.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-[16px] border-[2px] border-[var(--card-shell)] bg-[var(--card-fill)] p-3">
                  <Lock className="h-5 w-5 text-[#ff8f1c] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink-dark)]">MQTT Password Required</p>
                    <p className="text-xs text-[var(--ink-muted)]">
                      For security, the password was not copied.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-[16px] border-[2px] border-[var(--card-shell)] bg-[var(--card-fill)] p-3">
                  <Hash className="h-5 w-5 text-[#2563eb] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink-dark)]">Topic Changed</p>
                    <p className="text-xs text-[var(--ink-muted)]">
                      The MQTT topic is now:
                    </p>
                    <code className="mt-1 inline-block rounded-md bg-[var(--ink-dark)] px-2 py-1 text-xs text-[var(--card-fill)] font-mono">
                      led-copy
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Shadows & Effects Section */}
        <section>
          <h2 className="text-2xl font-bold text-[var(--card-fill)] mb-6">Shadows & Effects</h2>
          <div className="card-panel p-6">
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white p-4 shadow-[3px_3px_0_var(--shadow-deep)]">
                <p className="text-sm font-semibold">Small Shadow</p>
                <code className="text-xs text-[var(--ink-muted)]">3px 3px</code>
              </div>
              <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white p-4 shadow-[5px_5px_0_var(--shadow-deep)]">
                <p className="text-sm font-semibold">Medium Shadow</p>
                <code className="text-xs text-[var(--ink-muted)]">5px 5px</code>
              </div>
              <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white p-4 shadow-[8px_8px_0_var(--shadow-deep)]">
                <p className="text-sm font-semibold">Large Shadow</p>
                <code className="text-xs text-[var(--ink-muted)]">8px 8px</code>
              </div>
            </div>
          </div>
        </section>

        {/* Border Radius Section */}
        <section>
          <h2 className="text-2xl font-bold text-[var(--card-fill)] mb-6">Border Radius</h2>
          <div className="card-panel p-6">
            <div className="flex flex-wrap gap-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-[12px] border-2 border-[var(--card-shell)] bg-[var(--ink-dark)]"></div>
                <p className="mt-2 text-xs text-[var(--ink-muted)]">12px</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-[16px] border-2 border-[var(--card-shell)] bg-[var(--ink-dark)]"></div>
                <p className="mt-2 text-xs text-[var(--ink-muted)]">16px</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-[20px] border-2 border-[var(--card-shell)] bg-[var(--ink-dark)]"></div>
                <p className="mt-2 text-xs text-[var(--ink-muted)]">20px</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full border-2 border-[var(--card-shell)] bg-[var(--ink-dark)]"></div>
                <p className="mt-2 text-xs text-[var(--ink-muted)]">full</p>
              </div>
            </div>
          </div>
        </section>

        {/* Border Widths Section */}
        <section>
          <h2 className="text-2xl font-bold text-[var(--card-fill)] mb-6">Border Widths</h2>
          <div className="card-panel p-6">
            <div className="flex flex-wrap gap-6">
              <div className="text-center">
                <div className="w-20 h-12 rounded-[12px] border border-[var(--card-shell)] bg-white"></div>
                <p className="mt-2 text-xs text-[var(--ink-muted)]">1px</p>
              </div>
              <div className="text-center">
                <div className="w-20 h-12 rounded-[12px] border-2 border-[var(--card-shell)] bg-white"></div>
                <p className="mt-2 text-xs text-[var(--ink-muted)]">2px</p>
              </div>
              <div className="text-center">
                <div className="w-20 h-12 rounded-[12px] border-[3px] border-[var(--card-shell)] bg-white"></div>
                <p className="mt-2 text-xs text-[var(--ink-muted)]">3px</p>
              </div>
              <div className="text-center">
                <div className="w-20 h-12 rounded-[12px] border-4 border-[var(--card-shell)] bg-white"></div>
                <p className="mt-2 text-xs text-[var(--ink-muted)]">4px</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t-4 border-[var(--card-shell)] bg-[var(--card-fill)] px-6 py-8 mt-16">
        <p className="text-center text-sm text-[var(--ink-muted)]">
          Prompting Realities Design System
        </p>
      </footer>

      {/* Modals */}
      <ConfirmationModal
        isOpen={showDangerModal}
        title="Delete LLM thing?"
        message="Are you sure you want to delete this? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => setShowDangerModal(false)}
        onCancel={() => setShowDangerModal(false)}
      />
      <ConfirmationModal
        isOpen={showWarningModal}
        title="Another LLM is Running"
        message="You can only run one LLM thing at a time. Please stop the running one first."
        confirmLabel="Got it"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={() => setShowWarningModal(false)}
        onCancel={() => setShowWarningModal(false)}
      />
      <ConfirmationModal
        isOpen={showInfoModal}
        title="Information"
        message="This is an informational modal used to display helpful tips or instructions to the user."
        confirmLabel="Got it"
        cancelLabel="Cancel"
        variant="info"
        onConfirm={() => setShowInfoModal(false)}
        onCancel={() => setShowInfoModal(false)}
      />
    </div>
  );
}
