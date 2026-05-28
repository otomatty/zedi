import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { NoteSummary } from "@/types/note";
import { NoteListRow } from "./NoteListRow";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/lib/dateUtils", () => ({
  formatTimeAgo: () => "common.date.hoursAgo",
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

const note: NoteSummary = {
  id: "note-1",
  ownerUserId: "u1",
  title: "Team wiki",
  visibility: "private",
  editPermission: "owner_only",
  isOfficial: false,
  isDefault: false,
  viewCount: 0,
  showTagFilterBar: false,
  defaultFilterTags: [],
  createdAt: 0,
  updatedAt: Date.now() - 3600_000,
  isDeleted: false,
  role: "owner",
  pageCount: 4,
  memberCount: 2,
};

describe("NoteListRow", () => {
  it("navigates to the note on row click", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/notes"]}>
        <Routes>
          <Route
            path="/notes"
            element={
              <>
                <NoteListRow note={note} showPinAction onTogglePin={vi.fn()} isPinned={false} />
                <LocationProbe />
              </>
            }
          />
          <Route path="/notes/:noteId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("link", { name: "Team wiki" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/notes/note-1");
  });

  it("calls onTogglePin without navigating", async () => {
    const onTogglePin = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/notes"]}>
        <Routes>
          <Route
            path="/notes"
            element={
              <>
                <NoteListRow note={note} showPinAction onTogglePin={onTogglePin} isPinned={false} />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "notes.list.pin" }));
    expect(onTogglePin).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location")).toHaveTextContent("/notes");
  });

  it("handles null title without crashing", () => {
    render(
      <MemoryRouter>
        <NoteListRow
          note={{ ...note, title: null as unknown as string }}
          showPinAction
          onTogglePin={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "notes.untitledNote" })).toBeInTheDocument();
  });
});
