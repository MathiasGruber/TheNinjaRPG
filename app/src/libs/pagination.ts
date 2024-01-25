import { useRef, useState, useEffect } from "react";
import { show_toast } from "@/libs/toast";

interface Pagination {
  fetchNextPage: () => Promise<any>;
  hasNextPage: boolean | undefined;
  lastElement: HTMLDivElement | null;
}

export const useInfinitePagination = ({
  fetchNextPage,
  hasNextPage,
  lastElement,
}: Pagination) => {
  const [page, setPage] = useState(0);
  const observer = useRef<IntersectionObserver | null>();

  /**
   * Mount only once
   */
  useEffect(() => {
    observer.current = new IntersectionObserver((entries) => {
      const first = entries[0];
      if (first && first.isIntersecting) {
        setPage((prev: number) => prev + 1);
      }
    });
  }, []); // do this only once, on mount

  /**
   * Update observer when last element changes
   */
  useEffect(() => {
    if (lastElement && observer.current) {
      observer.current.observe(lastElement);
    }
    return () => {
      if (lastElement && observer.current) {
        observer.current.unobserve(lastElement);
      }
    };
  }, [lastElement]);

  useEffect(() => {
    const fetchData = async () => {
      if (page > 0) await fetchNextPage();
    };
    if (hasNextPage) {
      fetchData().catch(() => {
        show_toast(
          "Error fetching batch",
          "Error fetching next batch of data",
          "error",
        );
      });
    }
  }, [fetchNextPage, hasNextPage, page]);
};
