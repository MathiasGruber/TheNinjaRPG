import { type NextPage } from "next";
import { useRouter } from "next/router";

import Image from "next/image";
import Button from "../layout/Button";
import ContentBox from "../layout/ContentBox";

import { getProviders, signIn } from "next-auth/react";
import { show_toast } from "../libs/toast";

interface Provider {
  id: string;
  name: string;
  callbackUrl: string;
}

interface LoginProps {
  providers: Provider[];
}

const Login: NextPage<LoginProps> = (props) => {
  // Catch error when logging in with an email that is already linked
  const router = useRouter();
  const error = router.query.error as string;

  if (error === "OAuthAccountNotLinked") {
    show_toast(
      "Error on login",
      "The email in question is already linked, but not with this login provider",
      "error"
    );
  }

  return (
    <ContentBox
      title="Login or Register"
      subtitle="To login please use one of below providers"
    >
      {props.providers &&
        Object.values(props.providers).map((provider) => {
          return provider ? (
            <Button
              key={provider.id}
              noJustify={true}
              image={
                <Image
                  src={`/images/${provider.id}.png`}
                  alt={provider.name}
                  className="relative left-0 mr-3"
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
