import React from "react";

interface PaginationProps {
  current: number;
  total: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}

const Pagination: React.FC<PaginationProps> = (props) => {
  return (
    <div className="my-4 flex flex-row justify-center">
      <nav aria-label="Page navigation example">
        <ul className="inline-flex -space-x-px">
          <li>
            <a
              href="#"
              className="ml-0 rounded-l-lg border border-gray-300 bg-white px-3 py-2 leading-tight text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              Previous
            </a>
          </li>
          {Array.from(Array(props.total)).map((_, i) => {
            return (
              <li key={i}>
                <a
                  href="#"
                  className={
                    i === props.current
                      ? "border border-gray-300 bg-blue-50 px-3 py-2 text-blue-600 hover:bg-blue-100 hover:text-blue-700"
                      : "border border-gray-300 bg-white px-3 py-2 leading-tight text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    props.setPage(i);
                  }}
                >
                  {i + 1}
                </a>
              </li>
            );
          })}
          <li>
            <a
              href="#"
              className="rounded-r-lg border border-gray-300 bg-white px-3 py-2 leading-tight text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              Next
            </a>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default Pagination;
