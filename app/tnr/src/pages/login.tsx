import { type NextPage } from "next";
import Image from "next/image";
import Button from "../layout/Button";
import ContentBox from "../layout/ContentBox";
import { getProviders, signIn } from "next-auth/react";

interface Provider {
  id: string;
  name: string;
  callbackUrl: string;
}

interface LoginProps {
  providers: Provider[];
}

const Login: NextPage<LoginProps> = (props) => {
  console.log(props.providers);
  return (
    <ContentBox
      title="Login or Register"
      subtitle="To login please use one of below providers"
    >
      {props.providers &&
        Object.values(props.providers).map((provider) => {
          console.log(provider);
          return provider ? (
            <Button
              key={provider.id}
              image={
                <Image
                  src={`/images/${provider.id}.png`}
                  alt={provider.name}
                  className="mr-3"
                  height={40}
                  width={40}
                />
              }
              id="create"
              label={`Login with ${provider.name}`}
              onClick={() =>
                signIn(provider.id, {
                  callbackUrl: "/",
                })
              }
            />
          ) : (
            <div></div>
          );
        })}
      <p className="text-xs italic">
        - Icons from <a href="https://icons8.com/">icons8.com</a>
      </p>
    </ContentBox>
  );
};

export default Login;

export const getServerSideProps = async () => {
  const providers = await getProviders();
  return {
    props: { providers },
  };
};
