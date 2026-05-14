import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SentryUserBinder } from "@/components/SentryUserBinder";
import Privacy from "@/pages/legal/Privacy";
import Terms from "@/pages/legal/Terms";
import Shipping from "@/pages/legal/Shipping";
import Returns from "@/pages/legal/Returns";
import Accessibility from "@/pages/legal/Accessibility";
import Contact from "@/pages/legal/Contact";

const Home = lazy(() => import("@/pages/home"));
const Shop = lazy(() => import("@/pages/shop"));
const Product = lazy(() => import("@/pages/product"));
const Cart = lazy(() => import("@/pages/cart"));
const Checkout = lazy(() => import("@/pages/checkout"));
const CheckoutSuccess = lazy(() => import("@/pages/checkout-success"));
const Account = lazy(() => import("@/pages/account"));
const AccountOrder = lazy(() => import("@/pages/account-order"));
const OrderDetail = lazy(() => import("@/pages/order-detail"));
const Blog = lazy(() => import("@/pages/blog"));
const BlogPost = lazy(() => import("@/pages/blog-post"));
const About = lazy(() => import("@/pages/about"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Unsubscribe = lazy(() => import("@/pages/Unsubscribe"));
const AdminDashboard = lazy(() => import("@/pages/admin/Dashboard"));
const AdminOrders = lazy(() => import("@/pages/admin/Orders"));
const AdminProducts = lazy(() => import("@/pages/admin/Products"));
const AdminNewsletter = lazy(() => import("@/pages/admin/Newsletter"));
const AdminDiscounts = lazy(() => import("@/pages/admin/AdminDiscounts"));
const AdminReviews = lazy(() => import("@/pages/admin/AdminReviews"));
const AdminAbandonedCarts = lazy(
  () => import("@/pages/admin/AdminAbandonedCarts"),
);
const AdminTaxSummary = lazy(() => import("@/pages/admin/AdminTaxSummary"));

const queryClient = new QueryClient();

function SkipToContent() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-background focus:shadow-lg"
      data-testid="skip-to-content"
    >
      Skip to content
    </a>
  );
}

function Router() {
  return (
    <Suspense fallback={null}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/shop" component={Shop} />
        <Route path="/products/:slug" component={Product} />
        <Route path="/cart" component={Cart} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/account" component={Account} />
        <Route path="/account/orders/:id" component={AccountOrder} />
        <Route path="/orders/:id" component={OrderDetail} />
        <Route path="/blog" component={Blog} />
        <Route path="/blog/:slug" component={BlogPost} />
        <Route path="/about" component={About} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/terms" component={Terms} />
        <Route path="/shipping-policy" component={Shipping} />
        <Route path="/returns" component={Returns} />
        <Route path="/accessibility" component={Accessibility} />
        <Route path="/contact" component={Contact} />
        <Route path="/unsubscribe" component={Unsubscribe} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/orders" component={AdminOrders} />
        <Route path="/admin/products" component={AdminProducts} />
        <Route path="/admin/newsletter" component={AdminNewsletter} />
        <Route path="/admin/discounts" component={AdminDiscounts} />
        <Route path="/admin/reviews" component={AdminReviews} />
        <Route path="/admin/abandoned-carts" component={AdminAbandonedCarts} />
        <Route path="/admin/tax" component={AdminTaxSummary} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SentryUserBinder />
        <SkipToContent />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
