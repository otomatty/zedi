import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDeleteAIConversation } from "./useDeleteAIConversation";

const { mockDeleteConversation, mockSetActiveConversation, mockGetState } = vi.hoisted(() => ({
  mockDeleteConversation: vi.fn(),
  mockSetActiveConversation: vi.fn(),
  mockGetState: vi.fn(() => ({ activeConversationId: null as string | null })),
}));

vi.mock("./useAIChatConversations", () => ({
  useAIChatConversations: () => ({
    deleteConversation: mockDeleteConversation,
  }),
}));

vi.mock("@/stores/aiChatStore", () => ({
  useAIChatStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        activeConversationId: mockGetState().activeConversationId,
        setActiveConversation: mockSetActiveConversation,
      }),
    { getState: mockGetState },
  ),
}));

describe("useDeleteAIConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockReturnValue({ activeConversationId: null });
  });

  it("calls deleteConversation with the given id", () => {
    const { result } = renderHook(() => useDeleteAIConversation());

    act(() => result.current("conv-1"));

    expect(mockDeleteConversation).toHaveBeenCalledWith("conv-1");
  });

  it("clears active conversation when deleting the active one", () => {
    mockGetState.mockReturnValue({ activeConversationId: "conv-1" });
    const { result } = renderHook(() => useDeleteAIConversation());

    act(() => result.current("conv-1"));

    expect(mockSetActiveConversation).toHaveBeenCalledWith(null);
  });

  it("does not clear active conversation when deleting a different one", () => {
    mockGetState.mockReturnValue({ activeConversationId: "conv-2" });
    const { result } = renderHook(() => useDeleteAIConversation());

    act(() => result.current("conv-1"));

    expect(mockDeleteConversation).toHaveBeenCalledWith("conv-1");
    expect(mockSetActiveConversation).not.toHaveBeenCalled();
  });
});
