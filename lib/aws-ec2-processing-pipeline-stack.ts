import {readFileSync} from 'fs';
import { Construct } from "constructs";
import { Stack, StackProps } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_sqs as sqs } from 'aws-cdk-lib';
import AutoScalingEC2 from "./constructs/auto-scaling-ec2";
import sqsAutoScalingRule from "./constructs/sqs-auto-scaling-rule";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import ElasticFileSystem from './constructs/elastic-file-system';

export interface CustomStackProps extends StackProps {
  name: string,
}

export class AwsEc2ProcessingPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: CustomStackProps) {
    super(scope, id, props);

    const name = props.name;

    const vpc = new ec2.Vpc(this, `ProcessingVPC-${id}`, {
      // cidr: "11.192.0.0/16",
      ipAddresses: ec2.IpAddresses.cidr("11.192.0.0/16"),
      maxAzs: 2,
      // No Nat Gateways by default, but can easily change it here.
      natGateways: 0,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      /**
       * Each entry in this list configures a Subnet Group
       *
       * PRIVATE_ISOLATED: Isolated Subnets do not route traffic to the Internet (in this VPC).
       * PRIVATE_WITH_NAT.: Subnet that routes to the internet, but not vice versa.
       * PUBLIC..: Subnet connected to the Internet.
       */
      subnetConfiguration: [
        // {
        //   cidrMask: 24,
        //   name: 'nat',
        //   subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        // },
        {
          cidrMask: 24,
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        }
      ],
    });

    /* Create queues */
    const sqsQueue = new sqs.Queue(this, 'queue', {
      queueName: `Queue-1-${name}`
    });
    const sqsQueue2 = new sqs.Queue(this, 'queue2', {
      queueName: `Queue-2-${name}`
    });

    const computeSecurityGroup = new ec2.SecurityGroup(this, 'ComputeSecurityGroup', {
      vpc,
    });

    const queue1Parameter = new StringParameter(this, 'queue1UrlParameter', {
      parameterName: "/processing-pipeline/queue1",
      stringValue: sqsQueue.queueUrl,
    })
    const queue2Parameter = new StringParameter(this, 'queue2UrlParameter', {
      parameterName: "/processing-pipeline/queue2",
      stringValue: sqsQueue2.queueUrl,
    });

    const fileSystem = new ElasticFileSystem(this, 'EFS', {
      vpc,
      securityGroup: computeSecurityGroup,
      name: 'EFS',
    })

    /* Create an AutoScaling EC2 Cluster that executes on this queue */
    /* In reality this would likely be configured with more options for different compute types */
    const appNameReplace = /_APP_NAME_/gi;
    let userDataScript = readFileSync('./lib/user-data.sh', 'utf8');
    userDataScript = userDataScript.replace('_QUEUE1_URL_PARAMETER_',queue1Parameter.parameterName);
    userDataScript = userDataScript.replace('_QUEUE2_URL_PARAMETER_',queue2Parameter.parameterName);
    userDataScript = userDataScript.replace('_EFS_VOLUME_ID_',fileSystem.fileSystem.fileSystemId);
    userDataScript = userDataScript.replace(appNameReplace,`SQSProcessor1${name}`);
    const autoScalingEC2Cluster = new AutoScalingEC2(this, 'AutoScalingEC2', {
      name: `SQS-ASG-1-${name}`,
      vpc,
      securityGroup: computeSecurityGroup,
      userDataCommands: userDataScript.split('\n'),
      // machineImage: ,
      // instanceType: ,
      // minCapacity: 1,
      // maxCapacity: 5,
    });

    /* Allow the EC2 instances in the auto scaling cluster to read from the queue */
    sqsQueue.grantConsumeMessages(autoScalingEC2Cluster.ec2Role);
    /* Allow EC2 instances in the auto scaling cluster to write to the next queue */
    sqsQueue2.grantSendMessages(autoScalingEC2Cluster.ec2Role);

    queue1Parameter.grantRead(autoScalingEC2Cluster.ec2Role);
    queue2Parameter.grantRead(autoScalingEC2Cluster.ec2Role);

    /* Configure the AutoScaling cluster to scale based on queue depth */
    new sqsAutoScalingRule(this, `SQSAutoScalingRule-${name}`, {
      policyName: 'sqs-target-tracking-scaling-policy-queue-1',
      queue: sqsQueue,
      autoScalingGroup: autoScalingEC2Cluster.autoScalingGroup,
      targetValue: 1, // Configure your desired number of jobs per instance for auto-scaling purposes.
    })


    /* Create a second one for the pipeline */

    /* Create an AutoScaling EC2 Cluster that executes on this queue */
    /* In reality this would likely be configured with more options for different compute types */
    let userDataScript2 = readFileSync('./lib/user-data-2.sh', 'utf8');
    userDataScript2 = userDataScript2.replace('_QUEUE2_URL_PARAMETER_',queue2Parameter.parameterName);
    userDataScript2 = userDataScript2.replace('_EFS_VOLUME_ID_',fileSystem.fileSystem.fileSystemId);
    userDataScript2 = userDataScript2.replace(appNameReplace,`SQSProcessor2${name}`);
    const autoScalingEC2Cluster2 = new AutoScalingEC2(this, 'AutoScalingEC2-2', {
      name: `SQS-ASG-2-${name}`,
      vpc,
      securityGroup: computeSecurityGroup,
      userDataCommands: userDataScript2.split('\n')
      // machineImage: ,
      // instanceType: ,
      // minCapacity: 1,
      // maxCapacity: 5,
    });

    /* Allow the EC2 instances in the auto scaling cluster to read from the queue */
    sqsQueue2.grantConsumeMessages(autoScalingEC2Cluster2.ec2Role);
    queue2Parameter.grantRead(autoScalingEC2Cluster2.ec2Role);

    /* Configure the AutoScaling cluster to scale based on queue depth */
    new sqsAutoScalingRule(this, `SQSAutoScalingRule2-${name}`, {
      policyName: 'sqs-target-tracking-scaling-policy-queue-2',
      queue: sqsQueue2,
      autoScalingGroup: autoScalingEC2Cluster2.autoScalingGroup,
      targetValue: 2, // Configure your desired number of jobs per instance for auto-scaling purposes.
    })

  }
}
