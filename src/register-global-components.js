import { register } from "riot";

const basename = (path, extension = "") =>
  path.split("/").reverse()[0].replace(extension, "");
const globalComponentsContext = import.meta.glob(
  "./components/global/**/*.riot",
  { eager: true }
);

export default () => {
  Object.entries(globalComponentsContext).map(([path, component]) => {
    const name = basename(path, ".riot");

    register(name, component.default || component);

    return {
      name,
      component,
    };
  });
};
