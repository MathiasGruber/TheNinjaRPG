import Image from "next/image";

interface LoaderProps {
  explanation?: string;
  noPadding?: boolean;
}

const Loader: React.FC<LoaderProps> = (props) => {
  return (
    <div className={`flex flex-col  items-center ${props.noPadding ? "" : "py-2"}`}>
      <Image alt="Loader Icon" src="/images/loader.gif" width={31} height={31} />
      <p>{props.explanation}</p>
    </div>
  );
};

export default Loader;
