/**
 * Carousel の公開 API とスクロール操作のテスト。
 * Tests the carousel's public API and available scroll actions.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "./carousel";

const embla = vi.hoisted(() => ({
  api: undefined as CarouselApi,
  viewportRef: vi.fn(),
}));

vi.mock("embla-carousel-react", () => ({
  default: () => [embla.viewportRef, embla.api],
}));

type ScrollEvent = "select" | "reInit";
type ScrollListener = (api: NonNullable<CarouselApi>) => void;

function createApi(canScrollPrev: boolean, canScrollNext: boolean) {
  const listeners = {
    select: new Set<ScrollListener>(),
    reInit: new Set<ScrollListener>(),
  };
  const api = {
    canScrollPrev: vi.fn(() => canScrollPrev),
    canScrollNext: vi.fn(() => canScrollNext),
    scrollPrev: vi.fn(),
    scrollNext: vi.fn(),
    on: vi.fn((event: ScrollEvent, callback: ScrollListener) => {
      listeners[event].add(callback);
      return api;
    }),
    off: vi.fn((event: ScrollEvent, callback: ScrollListener) => {
      listeners[event].delete(callback);
      return api;
    }),
  };

  // Only the Embla methods used by the carousel are needed for this test double.
  const emblaApi = api as unknown as NonNullable<CarouselApi>;

  return {
    api,
    emblaApi,
    emit(event: ScrollEvent) {
      listeners[event].forEach((listener) => listener(emblaApi));
    },
  };
}

function Slides({ setApi }: { setApi?: (api: CarouselApi) => void }) {
  return (
    <Carousel setApi={setApi}>
      <CarouselContent>
        <CarouselItem>First slide</CarouselItem>
        <CarouselItem>Second slide</CarouselItem>
        <CarouselItem>Third slide</CarouselItem>
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}

describe("Carousel", () => {
  beforeEach(() => {
    embla.api = undefined;
    embla.viewportRef.mockClear();
  });

  afterEach(cleanup);

  it("disables both buttons and does not expose an API before Embla is ready", () => {
    const setApi = vi.fn();

    render(<Slides setApi={setApi} />);

    expect(screen.getByRole("button", { name: "Previous slide" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();
    expect(setApi).not.toHaveBeenCalled();
  });

  it("initializes button availability and exposes the API when Embla becomes ready", () => {
    const setApi = vi.fn();
    const { api, emblaApi } = createApi(false, true);
    const { rerender } = render(<Slides setApi={setApi} />);

    embla.api = emblaApi;
    rerender(<Slides setApi={setApi} />);

    expect(screen.getByRole("button", { name: "Previous slide" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeEnabled();
    expect(setApi).toHaveBeenCalledExactlyOnceWith(api);
  });

  it("updates both buttons as selection moves between the beginning, middle, and end", () => {
    const fake = createApi(false, true);
    embla.api = fake.emblaApi;
    render(<Slides />);
    const previous = screen.getByRole("button", { name: "Previous slide" });
    const next = screen.getByRole("button", { name: "Next slide" });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();

    act(() => {
      fake.api.canScrollPrev.mockReturnValue(true);
      fake.emit("select");
    });

    expect(previous).toBeEnabled();
    expect(next).toBeEnabled();

    act(() => {
      fake.api.canScrollNext.mockReturnValue(false);
      fake.emit("select");
    });

    expect(previous).toBeEnabled();
    expect(next).toBeDisabled();

    act(() => {
      fake.api.canScrollPrev.mockReturnValue(false);
      fake.api.canScrollNext.mockReturnValue(true);
      fake.emit("select");
    });

    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();
  });

  it("rechecks both scroll directions when Embla reinitializes", () => {
    const fake = createApi(true, false);
    embla.api = fake.emblaApi;
    render(<Slides />);

    act(() => {
      fake.api.canScrollPrev.mockReturnValue(false);
      fake.emit("reInit");
    });

    expect(screen.getByRole("button", { name: "Previous slide" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();

    act(() => {
      fake.api.canScrollPrev.mockReturnValue(true);
      fake.api.canScrollNext.mockReturnValue(true);
      fake.emit("reInit");
    });

    expect(screen.getByRole("button", { name: "Previous slide" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeEnabled();
  });

  it("scrolls in the requested direction when an enabled button is clicked", () => {
    const { api, emblaApi } = createApi(true, true);
    embla.api = emblaApi;
    render(<Slides />);

    fireEvent.click(screen.getByRole("button", { name: "Previous slide" }));

    expect(api.scrollPrev).toHaveBeenCalledExactlyOnceWith();
    expect(api.scrollNext).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));

    expect(api.scrollPrev).toHaveBeenCalledExactlyOnceWith();
    expect(api.scrollNext).toHaveBeenCalledExactlyOnceWith();
  });

  it("uses a replacement API and ignores selections from the previous API", () => {
    const first = createApi(false, true);
    const second = createApi(true, false);
    const setApi = vi.fn();
    embla.api = first.emblaApi;
    const { rerender } = render(<Slides setApi={setApi} />);

    embla.api = second.emblaApi;
    rerender(<Slides setApi={setApi} />);

    expect(setApi).toHaveBeenCalledTimes(2);
    expect(setApi).toHaveBeenNthCalledWith(1, first.api);
    expect(setApi).toHaveBeenNthCalledWith(2, second.api);
    expect(screen.getByRole("button", { name: "Previous slide" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();

    act(() => first.emit("select"));

    expect(screen.getByRole("button", { name: "Previous slide" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();
  });

  it("ignores reinitialization from the old API after replacing it", () => {
    const first = createApi(false, true);
    const second = createApi(true, false);
    embla.api = first.emblaApi;
    const { rerender } = render(<Slides />);

    embla.api = second.emblaApi;
    rerender(<Slides />);
    act(() => first.emit("reInit"));

    expect(screen.getByRole("button", { name: "Previous slide" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();
  });

  it("disables both buttons when the API becomes unavailable", () => {
    const fake = createApi(true, true);
    embla.api = fake.emblaApi;
    const { rerender } = render(<Slides />);
    expect(screen.getByRole("button", { name: "Previous slide" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeEnabled();

    embla.api = undefined;
    rerender(<Slides />);

    expect(screen.getByRole("button", { name: "Previous slide" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();
  });
});
