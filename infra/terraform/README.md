# Estia — Terraform

Provisions the **net-new** AWS resources for Estia: S3 bucket + IAM.
The existing EC2 was created out-of-band; the commented stubs at the bottom of
`main.tf` are placeholders for when you choose to bring it under Terraform via
`terraform import`.

## Apply

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

Then attach the new IAM instance profile to the running EC2:

```bash
aws ec2 associate-iam-instance-profile \
  --instance-id i-XXXXXXXXXXXX \
  --iam-instance-profile Name=estia-prod-app \
  --region eu-north-1
```

After that, the box can read/write `s3://estia-prod/*` without any keys in `.env`.

## Cost impact

Adds **$0.21/month** at current scale (S3 standard storage 5 GB × $0.023 + a
handful of PUT requests).
